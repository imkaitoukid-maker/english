/* Single-threaded sherpa-onnx runs in this dedicated Worker. No audio is uploaded. */
importScripts('./audio-utils.js');
let recognizer = null, stream = null, inputRate = 16000, manifest = null;
let sessionId = null, committed = '', inputSeconds = 0, computeMs = 0, lastReport = 0;
let initialization = null;
const report = (type, data = {}) => self.postMessage({ type, ...data });
const normalize = text => (text || '').replace(/\s+/g, ' ').trim();
const append = (left, right) => [left, right].filter(Boolean).join(' ');

async function fetchAsset(asset, previousBytes, totalBytes, destination) {
  const controller = new AbortController();
  let watchdog;
  const resetTimeout = () => { clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(), 90000); };
  resetTimeout();
  try {
    const response = await fetch(new URL(asset.path, self.location.href), { signal: controller.signal });
    if (!response.ok) throw new Error(`资源下载失败 (${response.status})：${asset.path}。请确认部署包含 vendor 目录。`);
    const buffer = destination || new Uint8Array(asset.bytes);
    let offset = 0;
    const progress = () => report('progress', { stage: asset.path.endsWith('.data') ? '下载英文模型' : '下载 WASM 引擎', loaded: previousBytes + offset, total: totalBytes });
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.length > asset.bytes) throw new Error(`资源大小不符：${asset.path}`);
          buffer.set(value, offset); offset += value.length; resetTimeout(); progress();
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== asset.bytes) throw new Error(`资源大小不符：${asset.path}`);
      buffer.set(bytes); offset = bytes.length; progress();
    }
    if (offset !== asset.bytes) throw new Error(`资源下载不完整：${asset.path}。请刷新重试。`);
    return buffer;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('下载连续 90 秒没有响应，请检查网络后重试。');
    throw error;
  } finally { clearTimeout(watchdog); }
}

async function initialize() {
  const began = performance.now();
  if (!self.WebAssembly) throw new Error('当前浏览器不支持 WebAssembly，请使用 Safari 打开。');
  const response = await fetch('./asset-manifest.json');
  if (!response.ok) throw new Error('找不到 asset-manifest.json，请上传完整项目目录。');
  manifest = await response.json();
  const dataAssets = manifest.modelParts.map(path => manifest.assets.find(asset => asset.path === path));
  const wasmAsset = manifest.assets.find(a => a.path.endsWith('.wasm'));
  const totalBytes = manifest.modelBytes + wasmAsset.bytes;
  let modelData = new Uint8Array(manifest.modelBytes), loaded = 0;
  for (const asset of dataAssets) {
    await fetchAsset(asset, loaded, totalBytes, modelData.subarray(loaded, loaded + asset.bytes));
    loaded += asset.bytes;
  }
  const wasmData = await fetchAsset(wasmAsset, loaded, totalBytes);
  report('progress', { stage: '初始化引擎与预热，暂时无需麦克风权限', loaded: totalBytes, total: totalBytes });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('引擎初始化超时，请关闭其他页面后重试。')), 120000);
    self.Module = {
      wasmBinary: wasmData,
      locateFile: name => new URL('./vendor/' + name, self.location.href).href,
      getPreloadedPackage: () => modelData.buffer,
      print: text => report('log', { text: String(text).slice(0, 500) }),
      printErr: text => report('log', { text: String(text).slice(0, 500) }),
      onAbort: reason => { clearTimeout(timer); reject(new Error(`WASM 引擎中止：${String(reason).slice(0, 250)}`)); },
      onRuntimeInitialized() {
        try {
          recognizer = createOnlineRecognizer(self.Module, {
            featConfig: { sampleRate: 16000, featureDim: 80 },
            modelConfig: {
              transducer: { encoder: './encoder.onnx', decoder: './decoder.onnx', joiner: './joiner.onnx' },
              tokens: './tokens.txt', numThreads: 1, provider: 'cpu', debug: 0, modelType: '',
            },
            decodingMethod: 'greedy_search', maxActivePaths: 4, enableEndpoint: 1,
            rule1MinTrailingSilence: 4, rule2MinTrailingSilence: 2.2, rule3MinUtteranceLength: 20,
          });
          if (!recognizer.handle) throw new Error('模型初始化失败，当前 WASM 与模型可能不匹配。');
          const warmup = recognizer.createStream();
          try {
            warmup.acceptWaveform(16000, new Float32Array(16000)); warmup.inputFinished();
            while (recognizer.isReady(warmup)) recognizer.decode(warmup);
          } finally { warmup.free(); }
          modelData = null;
          delete self.Module.getPreloadedPackage;
          delete self.Module.wasmBinary;
          clearTimeout(timer); resolve();
        } catch (error) { clearTimeout(timer); reject(error); }
      },
    };
    try { importScripts('./vendor/sherpa-onnx-asr.js', './vendor/sherpa-onnx-wasm-main-asr.js'); }
    catch (error) { clearTimeout(timer); reject(error); }
  });
  return { loadMs: performance.now() - began, heapBytes: self.Module.HEAPU8.byteLength, runtimeVersion: manifest.runtimeVersion, model: manifest.model };
}

function beginSession(id, rate) {
  if (!recognizer) throw new Error('请先加载模型。');
  if (stream) stream.free();
  sessionId = id; committed = ''; inputSeconds = 0; computeMs = 0; lastReport = 0;
  stream = recognizer.createStream();
  if (!stream.handle) throw new Error('无法创建识别会话，请重新加载页面。');
  inputRate = rate;
}
function decodeAvailable() { while (recognizer.isReady(stream)) recognizer.decode(stream); }
function currentResult() {
  const result = recognizer.getResult(stream);
  return normalize(result.text);
}
function publish(force = false, partialOverride) {
  const now = performance.now();
  if (!force && now - lastReport < 150) return;
  lastReport = now;
  report('result', {
    sessionId, committed, partial: partialOverride ?? currentResult(), inputSeconds,
    computeMs, rtf: inputSeconds ? computeMs / 1000 / inputSeconds : 0,
    heapBytes: self.Module.HEAPU8.byteLength,
  });
}
function acceptAudio(samples, rate) {
  const began = performance.now();
  // sherpa-onnx's native feature pipeline keeps its resampler state per stream.
  // Pass the actual AudioContext rate (including Safari's 44.1/48 kHz fallback).
  if (samples.length) { stream.acceptWaveform(rate, samples); decodeAvailable(); }
  if (recognizer.isEndpoint(stream)) {
    committed = append(committed, currentResult()); recognizer.reset(stream);
  }
  inputSeconds += samples.length / rate;
  computeMs += performance.now() - began;
  publish();
}
function finishSession() {
  const began = performance.now();
  // Right context is required to decode the last word. This padding is excluded
  // from the measured input duration and never causes a second microphone read.
  stream.acceptWaveform(inputRate, new Float32Array(Math.round(inputRate * 0.8)));
  stream.inputFinished(); decodeAvailable();
  committed = append(committed, currentResult());
  computeMs += performance.now() - began;
  publish(true, '');
  const result = { sessionId, text: committed, inputSeconds, computeMs, rtf: inputSeconds ? computeMs / 1000 / inputSeconds : 0, heapBytes: self.Module.HEAPU8.byteLength };
  stream.free(); stream = null; sessionId = null;
  return result;
}

self.onmessage = async ({ data }) => {
  try {
    let response;
    switch (data.type) {
      case 'init':
        initialization ||= initialize(); response = await initialization;
        break;
      case 'begin':
        beginSession(data.sessionId, data.sampleRate); response = { sessionId };
        break;
      case 'audio':
        if (stream && data.sessionId === sessionId) acceptAudio(new Float32Array(data.buffer), data.sampleRate);
        return;
      case 'finish':
        if (!stream || data.sessionId !== sessionId) throw new Error('识别会话已结束。');
        response = finishSession(); break;
      case 'sample': {
        const wave = SayItAudio.parsePcmWave(data.buffer);
        beginSession(data.sessionId, wave.sampleRate);
        for (let offset = 0; offset < wave.samples.length; offset += 1600) {
          acceptAudio(wave.samples.subarray(offset, offset + 1600), wave.sampleRate);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        response = finishSession(); break;
      }
      default: throw new Error('未知识别操作');
    }
    report('reply', { replyTo: data.requestId, response });
  } catch (error) {
    report('failure', { replyTo: data.requestId, message: error.message || String(error), fatal: data.type === 'init' || data.type === 'audio' });
  }
};
