import './audio-utils.js';
import { pipeline, env } from './vendor/whisper/transformers.min.js';

let transcriber = null, initialization = null, session = null;
const RATE = 16000, UPDATE_SAMPLES = 3 * RATE, PAUSE_SAMPLES = 1.6 * RATE;
const report = (type, data = {}) => self.postMessage({ type, ...data });
const join = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

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
async function initialize() {
  const began = performance.now();
  const response = await fetch('./whisper-manifest.json');
  if (!response.ok) throw new Error('找不到 whisper-manifest.json，请上传新增的完整文件。');
  const manifest = await response.json(), resources = new Map();
  // JS and module glue load using same-origin ESM. Model/wasm bytes are loaded
  // explicitly for progress reporting and to assemble the split decoder.
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
function begin(id, rate) {
  if (!transcriber) throw new Error('请先加载 Whisper 模型。');
  session = { id, rate, resampler:new SayItAudio.StreamingResampler(rate), chunks:[], length:0, offset:0, accepted:0, recognized:0, committed:'', partial:'', voice:0, lastVoice:0, lastSnapshot:0, computeMs:0, inFlight:null, finishing:false, lastReport:0 };
}
function combine(chunks, length) {
  const data = new Float32Array(length); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data;
}
function energy(samples) { let sum = 0; for (const value of samples) sum += value * value; return samples.length ? Math.sqrt(sum / samples.length) : 0; }
function appendAudio(s, samples) {
  if (!samples.length) return;
  s.chunks.push(samples); s.length += samples.length; s.accepted += samples.length;
  if (energy(samples) > 0.0025) { s.voice += samples.length; s.lastVoice = s.accepted; }
}
function publish(s, force = false) {
  if (!force && performance.now() - s.lastReport < 150) return;
  s.lastReport = performance.now();
  report('result', { sessionId:s.id, committed:s.committed, partial:s.partial, inputSeconds:s.recognized / RATE, computeMs:s.computeMs, rtf:s.recognized ? s.computeMs / 1000 / (s.recognized / RATE) : 0, heapUnavailable:true });
}
async function infer(s, commit) {
  const length = s.length, offset = s.offset, snapshot = combine(s.chunks, length);
  s.lastSnapshot = s.accepted;
  const began = performance.now();
  const output = await transcriber(snapshot, { max_new_tokens:192, do_sample:false, num_beams:1, condition_on_prev_tokens:false });
  s.computeMs += performance.now() - began;
  if (session !== s) return;
  const text = join(output.text);
  s.recognized = Math.max(s.recognized, offset + length);
  if (commit) {
    s.committed = join(s.committed, text); s.partial = '';
    const all = combine(s.chunks, s.length), remaining = all.slice(length);
    s.offset += length; s.length = remaining.length; s.chunks = remaining.length ? [remaining] : [];
    s.voice = 0; s.lastVoice = s.offset;
    for (let i = 0; i < remaining.length; i += 320) {
      const chunk = remaining.subarray(i, i + 320);
      if (energy(chunk) > 0.0025) { s.voice += chunk.length; s.lastVoice = s.offset + i + chunk.length; }
    }
  } else s.partial = text;
  publish(s, true);
}
function maybeInfer(s) {
  if (s.inFlight || s.finishing || session !== s) return;
  if (!s.voice) {
    // Keep a short pre-roll so the first soft consonant is retained.
    if (s.length > RATE) {
      const keep = combine(s.chunks, s.length).slice(-6400);
      s.offset += s.length - keep.length; s.length = keep.length; s.chunks = [keep];
    }
    s.recognized = s.accepted; publish(s); return;
  }
  const paused = s.accepted - s.lastVoice >= PAUSE_SAMPLES;
  if (!paused && (s.length < UPDATE_SAMPLES || s.accepted - s.lastSnapshot < UPDATE_SAMPLES)) return;
  const promise = infer(s, paused); s.inFlight = promise;
  promise.then(() => { if (s.inFlight === promise) s.inFlight = null; maybeInfer(s); }).catch(error => {
    s.inFlight = null; s.finishing = true;
    report('failure', { message:error.message || String(error), fatal:true });
  });
}
function accept(data) {
  const s = session;
  if (!s || s.id !== data.sessionId || s.finishing) return;
  const began = performance.now();
  appendAudio(s, s.resampler.process(new Float32Array(data.buffer)));
  s.computeMs += performance.now() - began; maybeInfer(s);
}
async function finish() {
  const s = session; if (!s) throw new Error('识别会话已经结束。');
  s.finishing = true;
  appendAudio(s, s.resampler.flush());
  if (s.inFlight) await s.inFlight;
  if (s.voice && s.length) await infer(s, true);
  else { s.partial = ''; s.recognized = s.accepted; }
  s.recognized = s.accepted; publish(s, true);
  const response = { sessionId:s.id, text:s.committed, inputSeconds:s.accepted / RATE, computeMs:s.computeMs, rtf:s.accepted ? s.computeMs / 1000 / (s.accepted / RATE) : 0, heapBytes:null, heapUnavailable:true };
  session = null; return response;
}
self.onmessage = async ({data}) => {
  try {
    let response;
    switch (data.type) {
      case 'init': initialization ||= initialize(); response = await initialization; break;
      case 'begin': begin(data.sessionId, data.sampleRate); response = {sessionId:data.sessionId}; break;
      case 'audio': accept(data); return;
      case 'finish':
        if (session?.id !== data.sessionId) throw new Error('识别会话已结束。');
        response = await finish(); break;
      case 'sample': {
        const wave = SayItAudio.parsePcmWave(data.buffer); begin(data.sessionId, wave.sampleRate);
        const s = session, began = performance.now();
        appendAudio(s, s.resampler.process(wave.samples)); s.computeMs += performance.now() - began;
        response = await finish(); break;
      }
      default: throw new Error('未知 Whisper 操作');
    }
    report('reply', {replyTo:data.requestId,response});
  } catch (error) { report('failure', {replyTo:data.requestId,message:error.message || String(error),fatal:data.type === 'init' || data.type === 'audio'}); }
};
