import { installWhisperSession } from './whisper-session.js';
import { pipeline, env } from './vendor/whisper/transformers.min.js';

let transcriber = null;
const RATE = 16000;
const report = (type, data = {}) => self.postMessage({ type, ...data });

async function download(asset, previous, total) {
  const controller = new AbortController(); let timeout;
  const reset = () => { clearTimeout(timeout); timeout = setTimeout(() => controller.abort(), 90000); };
  reset();
  try {
    const response = await fetch(new URL(asset.path, self.location.href), { signal: controller.signal });
    if (!response.ok) throw new Error(`资源下载失败 (${response.status})：${asset.path}`);
    const bytes = new Uint8Array(asset.bytes); let offset = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const next = await reader.read(); if (next.done) break;
        if (offset + next.value.length > bytes.length) throw new Error('Whisper 资源大小不符，请确认完整部署。');
        bytes.set(next.value, offset); offset += next.value.length; reset();
        report('progress', { stage: asset.path.endsWith('.wasm') ? '下载 Whisper WASM 引擎' : '下载 Whisper 英文模型', loaded: previous + offset, total });
      }
    } else { const data = new Uint8Array(await response.arrayBuffer()); bytes.set(data); offset = data.length; }
    if (offset !== bytes.length) throw new Error(`Whisper 资源不完整：${asset.path}`);
    return bytes;
  } catch (error) { if (error.name === 'AbortError') throw new Error('Whisper 下载连续 90 秒无响应，请检查网络后重试。'); throw error; }
  finally { clearTimeout(timeout); }
}
async function initialize({manifest:manifestPath}) {
  const began = performance.now();
  const response = await fetch(new URL(manifestPath, self.location.href));
  if (!response.ok) throw new Error('找不到 whisper-manifest.json，请上传新增的完整文件。');
  const manifest = await response.json(), resources = new Map();
  // JS and module glue load using same-origin ESM. Model/wasm bytes are loaded
  // explicitly for progress reporting and to assemble split encoder and decoder files.
  const assets = manifest.assets.filter(asset => !/\.(mjs|js)$/.test(asset.path));
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0); let loaded = 0;
  for (const asset of assets) { resources.set(asset.path, await download(asset, loaded, total)); loaded += asset.bytes; }
  env.allowRemoteModels = false; env.allowLocalModels = true;
  env.localModelPath = new URL('./vendor/whisper/models/', self.location.href).href;
  env.useBrowserCache = false; env.useFSCache = false; env.useCustomCache = true;
  const virtual = new Map();
  for (const file of manifest.modelFiles) {
    let bytes;
    if (file.parts.length === 1) bytes = resources.get(file.parts[0]);
    else {
      bytes = new Uint8Array(file.bytes); let offset = 0;
      for (const part of file.parts) { const data = resources.get(part); bytes.set(data, offset); offset += data.length; }
    }
    virtual.set(new URL(file.path, self.location.href).href, bytes);
  }
  env.customCache = {
    async match(key) {
      const url = typeof key === 'string' ? key : key.url;
      const bytes = virtual.get(url);
      if (!bytes) return undefined;
      if (url.endsWith('.onnx')) virtual.delete(url);
      return new Response(bytes, { headers: { 'Content-Type':url.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'Content-Length':String(bytes.length) } });
    },
    async put() {},
  };
  const wasm = env.backends.onnx.wasm;
  wasm.numThreads = 1; wasm.proxy = false;
  wasm.wasmPaths = new URL('./vendor/whisper/', self.location.href).href;
  wasm.wasmBinary = resources.get('vendor/whisper/ort-wasm-simd-threaded.jsep.wasm');
  resources.clear();
  report('progress', { stage:'初始化 Whisper 并预热，暂时无需麦克风权限', loaded:total, total });
  transcriber = await pipeline('automatic-speech-recognition', manifest.modelId, { device:'wasm', dtype:'q8', local_files_only:true });
  await transcriber(new Float32Array(RATE / 2), { max_new_tokens:8 });
  wasm.wasmBinary = undefined;
  return { loadMs:performance.now() - began, heapBytes:null, heapUnavailable:true, model:manifest.model, runtimeVersion:manifest.runtimeVersion };
}

installWhisperSession({initialize, transcribe:snapshot => transcriber(snapshot,{max_new_tokens:192,do_sample:false,num_beams:1,condition_on_prev_tokens:false})});
