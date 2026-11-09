const $ = id => document.getElementById(id);
const VERSION = '1.1.0';
const ENGINES = {
  sherpa: { label:'sherpa-onnx · Zipformer', worker:'recognizer-worker.js', manifest:'asset-manifest.json', type:'classic', limit:60, queueLimit:5, description:'流式识别，连续接收音频并更新文字。只加载当前引擎；切换后需重新初始化。' },
  whisper: { label:'Transformers.js · Whisper tiny.en', worker:'whisper-worker.js', manifest:'whisper-manifest.json', type:'module', limit:20, queueLimit:12, description:'WASM 单线程；约每 3 秒重算当前短句，停顿或点击完成后定稿。适合短句对照，单次最多 20 秒。' },
};
let selectedEngine = 'sherpa';
const manifests = new Map();
const engineHistory = { sherpa:{ text:'',latest:null }, whisper:{ text:'',latest:null } };
const prompts = ["I'd like to practice my English today.", 'Could you help me find the library?', 'What do you like to do after school?', 'I think learning something new is exciting.'];
const ui = Object.fromEntries(['primaryButton','primaryLabel','primaryIcon','sampleButton','stateBadge','recorderTitle','recorderHint','downloadPanel','downloadProgress','downloadLabel','downloadPercent','downloadNote','errorMessage','durationLabel','inputLabel','visualizer','emptyTranscript','finalText','partialText','wordCount','clearButton','copyButton','resultHint','sampleReference','referenceText','loadMetric','firstWordMetric','rtfMetric','queueMetric','deviceInfo','eventLog','exportButton'].map(id => [id, $(id)]));
let state = 'idle', worker = null, modelReady = false, manifest = null;
let rpcCounter = 0, sessionCounter = 0, activeSession = null, currentMode = null;
let capture = null, timer = null, sentSeconds = 0, processedSeconds = 0, firstWordMs = null;
let sessionStarted = 0, prefix = '', savedText = '', latestPartial = '', promptIndex = 0;
let metrics = {}, sessions = [], logs = [], cacheStatus = '正在检查', captureMethod = '尚未录音';
const pending = new Map();
const join = (...parts) => parts.filter(Boolean).join(' ').trim();
const formatMs = ms => ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
const describe = { idle: ['等待准备','准备好你的声音','先加载模型，再允许浏览器使用麦克风。','加载本地模型','↓'], loading: ['正在准备','给声音一点准备时间','首次加载会下载模型；后续可使用浏览器缓存。','正在准备…','◌'], ready: ['可以开始','轮到你说了','点击开始，慢慢说英语；点击完成结束。','开始录音','●'], requesting: ['等待麦克风','打开麦克风','请在浏览器提示中允许使用麦克风。','正在打开…','◌'], recording: ['正在聆听','说吧，我在听','停顿后文字会定稿，录音继续；单次最多 60 秒。','完成录音','■'], stopping: ['正在定稿','保留最后一个词','正在处理已录入的音频，麦克风即将关闭。','正在完成…','◌'], sample: ['正在自检','先听一段示例','无需麦克风；用合成英语检查模型是否正常。','正在自检…','◌'], error: ['准备失败','再试一次','检查网络与浏览器后，可以重新加载。','重新加载模型','↻'] };

function log(text) {
  logs.push(`${new Date().toLocaleTimeString()}  ${text}`); logs = logs.slice(-100);
  ui.eventLog.textContent = logs.join('\n'); ui.eventLog.scrollTop = ui.eventLog.scrollHeight;
}
function setState(next) {
  state = next;
  const [badge, title, hint, button, icon] = describe[next];
  ui.stateBadge.textContent = badge; ui.stateBadge.dataset.state = next;
  ui.recorderTitle.textContent = title; ui.recorderHint.textContent = hint;
  ui.primaryLabel.textContent = button; ui.primaryIcon.textContent = icon;
  ui.primaryButton.disabled = ['loading','requesting','stopping','sample'].includes(next);
  ui.primaryButton.dataset.recording = String(next === 'recording');
  ui.sampleButton.disabled = !['idle','ready','error'].includes(next);
  ui.clearButton.disabled = !savedText || !['idle','ready','error'].includes(next);
  ui.visualizer.dataset.active = String(next === 'recording');
  ui.downloadPanel.hidden = next !== 'loading';
  document.querySelectorAll('[data-engine]').forEach(button => { button.disabled = !['idle','ready','error'].includes(next); });
  if (next === 'recording') ui.recorderHint.textContent = selectedEngine === 'whisper' ? '约每 3 秒更新当前短句；点击完成后定稿，单次最多 20 秒。' : hint;
  if (next !== 'recording') paintMeter(0);
}
function showError(error) {
  let message = error?.message || String(error);
  const names = {
    NotAllowedError: '麦克风权限未获允许。请在 Safari 的网站设置中允许麦克风，再点击开始。',
    NotFoundError: '没有找到可用麦克风，请检查设备或耳机。',
    NotReadableError: '麦克风无法打开，可能正被其他应用占用。请关闭占用后重试。',
    SecurityError: '录音需要 HTTPS。请使用 GitHub Pages 的 https 地址打开。',
  };
  if (names[error?.name]) message = names[error.name];
  ui.errorMessage.textContent = message; ui.errorMessage.hidden = false; log(`错误：${message}`);
}
function hideError() { ui.errorMessage.hidden = true; ui.errorMessage.textContent = ''; }
function renderText(committed = savedText, partial = '') {
  savedText = committed; latestPartial = partial;
  ui.emptyTranscript.hidden = Boolean(committed || partial);
  ui.finalText.textContent = committed;
  ui.partialText.textContent = partial ? (committed ? ' ' : '') + partial : '';
  const count = join(committed, partial).split(/\s+/).filter(Boolean).length;
  ui.wordCount.textContent = `${count} ${count === 1 ? 'word' : 'words'}`;
  ui.copyButton.disabled = !count;
  ui.clearButton.disabled = !count || !['idle','ready','error'].includes(state);
}
function updateDeviceInfo() {
  const rows = [
    ['识别引擎', ENGINES[selectedEngine].label],
    ['识别模型', manifest?.model || '加载模型后显示'],
    ['推理方式', selectedEngine === 'whisper' ? 'Transformers.js · WASM CPU 单线程 · 短句分段' : 'WebAssembly SIMD · CPU 单线程 · 独立 Worker'],
    ['采集方式', captureMethod],
    ['音频采样', capture ? `${capture.context.sampleRate} Hz → 16000 Hz` : '录音开始后显示实际采样率'],
    ['安全页面', window.isSecureContext ? 'HTTPS / localhost' : '否（麦克风不可用）'],
    ['离线缓存', cacheStatus],
    ['WASM 内存', metrics.heapUnavailable ? '此运行时未公开；不能据此比较整页内存' : metrics.heapBytes ? `${(metrics.heapBytes / 1024 / 1024).toFixed(1)} MiB（不含页面其他内存）` : '模型加载后显示'],
    ['浏览器', navigator.userAgent],
  ];
  ui.deviceInfo.replaceChildren();
  for (const [key, value] of rows) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = key; dd.textContent = value; ui.deviceInfo.append(dt, dd);
  }
}
function updateMetrics(data) {
  metrics = { ...metrics, ...data };
  if (data.loadMs != null) ui.loadMetric.textContent = formatMs(data.loadMs);
  if (data.rtf != null) {
    ui.rtfMetric.textContent = data.rtf.toFixed(2); ui.rtfMetric.dataset.warning = String(data.rtf >= 1);
  }
  if (data.inputSeconds != null) processedSeconds = data.inputSeconds;
  const backlog = currentMode === 'microphone' ? Math.max(0, sentSeconds - processedSeconds) : 0;
  ui.queueMetric.textContent = `${backlog.toFixed(1)} s`; ui.queueMetric.dataset.warning = String(backlog > 1);
  if (currentMode === 'sample' && data.inputSeconds != null) ui.durationLabel.textContent = `${data.inputSeconds.toFixed(1)} s`;
  if ('heapBytes' in data || 'heapUnavailable' in data) updateDeviceInfo();
}
function rpc(type, data = {}, timeoutMs = 120000) {
  const requestId = ++rpcCounter;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('操作等待超时，请重新加载模型。')); }, timeoutMs);
    pending.set(requestId, { resolve, reject, timeout });
    const message = { type, requestId, ...data };
    worker.postMessage(message, data.buffer ? [data.buffer] : []);
  });
}
function destroyWorker(reason = new Error('识别引擎已关闭')) {
  worker?.terminate(); worker = null; modelReady = false;
  for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(reason); }
  pending.clear();
}
function createWorker() {
  const profile = ENGINES[selectedEngine];
  worker = new Worker(new URL('./' + profile.worker, import.meta.url), {type:profile.type});
  worker.onerror = event => {
    const error = new Error(event.message || '识别 Worker 无法启动。请确认所有资源上传完整。');
    destroyWorker(error); void failSession(error);
  };
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      const percent = Math.round(data.loaded / data.total * 100);
      ui.downloadProgress.value = percent; ui.downloadPercent.textContent = `${percent}%`;
      ui.downloadLabel.textContent = data.stage;
    } else if (data.type === 'log') {
      log(`引擎：${data.text}`);
    } else if (data.type === 'result' && data.sessionId === activeSession) {
      renderText(join(prefix, data.committed), data.partial); updateMetrics(data);
      if (firstWordMs == null && (data.committed || data.partial)) {
        firstWordMs = performance.now() - sessionStarted;
        ui.firstWordMetric.textContent = formatMs(firstWordMs);
        if (currentMode === 'sample') ui.firstWordMetric.textContent += ' *';
      }
    } else if (data.type === 'reply' || data.type === 'failure') {
      const waiting = pending.get(data.replyTo);
      if (waiting) {
        clearTimeout(waiting.timeout); pending.delete(data.replyTo);
        if (data.type === 'reply') waiting.resolve(data.response); else waiting.reject(new Error(data.message));
      }
      if (data.type === 'failure' && data.fatal && !waiting) { destroyWorker(); void failSession(new Error(data.message)); }
    }
  };
}
async function loadModel() {
  hideError(); setState('loading'); ui.downloadProgress.value = 0; ui.downloadPercent.textContent = '0%';
  ui.downloadLabel.textContent = '检查本地资源…'; log(`开始加载 ${ENGINES[selectedEngine].label}`);
  try {
    destroyWorker(); createWorker();
    const result = await rpc('init', {}, 600000);
    modelReady = true; updateMetrics(result); setState('ready');
    log(`模型准备完成：${formatMs(result.loadMs)}${result.heapBytes ? `，WASM 内存 ${(result.heapBytes / 1048576).toFixed(1)} MiB` : '，运行时未公开 WASM 内存'}`);
    void checkOfflineCache(); return true;
  } catch (error) { destroyWorker(); setState('error'); showError(error); return false; }
}
function paintMeter(rms) {
  const energy = Math.min(1, rms * 11), bars = ui.visualizer.querySelectorAll('i');
  bars.forEach((bar, i) => {
    const envelope = 0.3 + 0.7 * Math.sin((i + 1) / (bars.length + 1) * Math.PI);
    const variation = 0.6 + Math.random() * 0.4;
    bar.style.height = `${4 + energy * 22 * envelope * variation}px`;
  });
}
function sendAudio(samples, rms, id, sampleRate) {
  if (activeSession !== id || !['recording','stopping'].includes(state) || !worker) return;
  sentSeconds += samples.length / sampleRate;
  worker.postMessage({ type: 'audio', sessionId: id, sampleRate, buffer: samples.buffer }, [samples.buffer]);
  paintMeter(rms);
  if (state === 'recording' && sentSeconds - processedSeconds > ENGINES[selectedEngine].queueLimit) {
    log(`待处理音频超过 ${ENGINES[selectedEngine].queueLimit} 秒，自动结束本轮以防积压`); void stopRecording('设备处理跟不上，已结束采集，正在处理剩余音频。');
  }
}
async function setupCapture() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!window.isSecureContext) throw new DOMException('HTTPS required', 'SecurityError');
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) throw new Error('此浏览器无法录音，请使用 Safari 直接打开 HTTPS 页面。');
  let context;
  try { context = new AudioContextClass({ sampleRate: 16000 }); }
  catch { context = new AudioContextClass(); }
  capture = { context, media: null, source: null, node: null, silent: null, flush: null };
  const owner = capture, requestedSession = activeSession;
  // Resume is invoked from the user's click, before permission / model work.
  await Promise.race([context.resume(), new Promise((_, reject) => setTimeout(() => reject(new Error('音频引擎未启动，请保持页面在前台后重试。')), 10000))]);
  const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  // A pending permission sheet can outlive pagehide; discard its result safely.
  if (capture !== owner || activeSession !== requestedSession || state !== 'requesting' || document.hidden) { media.getTracks().forEach(track => track.stop()); throw new Error('录音已取消，请回到页面后重试。'); }
  owner.media = media;
  if (context.state !== 'running') await context.resume();
  const source = context.createMediaStreamSource(media), silent = context.createGain(); silent.gain.value = 0;
  const id = requestedSession;
  let node;
  if (context.audioWorklet && window.AudioWorkletNode) {
    try {
      await context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      node = new AudioWorkletNode(context, 'say-it-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1 });
      node.port.onmessage = ({ data }) => {
        if (data.type === 'audio') sendAudio(new Float32Array(data.buffer), data.rms, id, context.sampleRate);
        if (data.type === 'flushed') owner.flush?.();
      };
      captureMethod = 'AudioWorklet';
    } catch (error) { log(`AudioWorklet 不可用，改用兼容采集：${error.message}`); }
  }
  if (!node) {
    node = context.createScriptProcessor(2048, 1, 1);
    node.onaudioprocess = event => {
      event.outputBuffer.getChannelData(0).fill(0);
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      let sum = 0; for (const sample of samples) sum += sample * sample;
      sendAudio(samples, Math.sqrt(sum / samples.length), id, context.sampleRate);
    };
    captureMethod = 'ScriptProcessor（兼容模式）';
  }
  if (capture !== owner || activeSession !== id || state !== 'requesting') { media.getTracks().forEach(track => track.stop()); throw new Error('录音已取消。'); }
  Object.assign(owner, { source, node, silent });
  media.getAudioTracks().forEach(track => track.addEventListener('ended', () => { if (state === 'recording') void stopRecording('麦克风连接结束。'); }));
  return { connect() { source.connect(node); node.connect(silent); silent.connect(context.destination); }, sampleRate: context.sampleRate };
}
async function cleanupCapture(flush = false) {
  const current = capture;
  if (!current) return;
  if (flush && current.node?.port && current.context.state === 'running') {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 600);
      current.flush = () => { clearTimeout(timeout); resolve(); };
      current.node.port.postMessage({ type: 'flush' });
    });
  }
  // Stop tracks before any awaited close(), so recording never waits for ASR.
  current.media?.getTracks().forEach(track => track.stop());
  try { current.source?.disconnect(); current.node?.disconnect(); current.silent?.disconnect(); } catch { /* Already disconnected. */ }
  if (current.node?.port) current.node.port.onmessage = null;
  if (current.node) current.node.onaudioprocess = null;
  if (capture === current) capture = null;
  await Promise.race([current.context.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]);
}
function prepareSession(mode) {
  activeSession = ++sessionCounter; currentMode = mode; prefix = savedText;
  sentSeconds = 0; processedSeconds = 0; firstWordMs = null; sessionStarted = performance.now();
  ui.firstWordMetric.textContent = '—'; ui.rtfMetric.textContent = '—'; ui.queueMetric.textContent = '0.0 s';
  ui.durationLabel.textContent = '00:00';
  ui.sampleReference.hidden = mode !== 'sample';
  ui.inputLabel.textContent = mode === 'sample' ? 'SYNTHETIC SAMPLE' : 'ENGLISH ONLY';
}
async function startRecording() {
  if (!modelReady || state !== 'ready') return;
  hideError(); setState('requesting'); prepareSession('microphone');
  const id = activeSession;
  try {
    const source = await setupCapture();
    if (activeSession !== id || state !== 'requesting') throw new Error('录音已取消。');
    await rpc('begin', { sessionId: id, sampleRate: source.sampleRate }, 15000);
    if (activeSession !== id || state !== 'requesting' || !capture || document.hidden) throw new Error('录音已取消。');
    sessionStarted = performance.now(); setState('recording'); source.connect(); updateDeviceInfo();
    log(`开始录音：${ENGINES[selectedEngine].label}，${captureMethod}，${source.sampleRate} Hz，单次最多 ${ENGINES[selectedEngine].limit} 秒`);
    timer = setInterval(() => {
      const seconds = Math.floor((performance.now() - sessionStarted) / 1000);
      ui.durationLabel.textContent = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
      if (seconds >= ENGINES[selectedEngine].limit && state === 'recording') void stopRecording(`已达到本轮 ${ENGINES[selectedEngine].limit} 秒上限，可再次开始练习。`);
    }, 200);
  } catch (error) {
    if (activeSession !== id) return;
    clearInterval(timer); await cleanupCapture(); activeSession = null;
    setState(modelReady ? 'ready' : 'error'); showError(error);
  }
}
function saveSession(result, mode) {
  updateMetrics(result);
  const entry = { at: new Date().toISOString(), engine:selectedEngine, model:manifest?.model, mode, firstWordMs, ...result };
  sessions.push(entry); sessions = sessions.slice(-30);
  engineHistory[selectedEngine].latest = entry; engineHistory[selectedEngine].text = savedText;
  renderComparison();
  log(`${mode === 'sample' ? '示例自检' : '录音'}完成：音频 ${result.inputSeconds.toFixed(2)} s，识别计算 ${formatMs(result.computeMs)}，比值 ${result.rtf.toFixed(3)}`);
}
async function stopRecording(reason) {
  if (state !== 'recording') return;
  setState('stopping'); clearInterval(timer);
  if (reason) { log(reason); ui.recorderHint.textContent = reason; }
  const id = activeSession;
  try {
    await cleanupCapture(true); ui.recorderHint.textContent = '麦克风已关闭，正在处理最后的文字。';
    const result = await rpc('finish', { sessionId: id });
    renderText(join(prefix, result.text)); saveSession(result, 'microphone'); activeSession = null;
    setState('ready'); ui.resultHint.textContent = result.text ? '本轮文字已定稿，可继续录音或复制' : '没有识别到英语，可以靠近麦克风再试一次';
    if (reason) ui.recorderHint.textContent = reason;
    await checkOfflineCache();
  } catch (error) { await failSession(error); }
}
async function failSession(error) {
  clearInterval(timer); activeSession = null; await cleanupCapture();
  if (latestPartial) renderText(join(savedText, latestPartial));
  destroyWorker(error); setState('error'); showError(error);
}
async function runSample() {
  if (!['idle','ready','error'].includes(state)) return;
  if (!modelReady && !await loadModel()) return;
  hideError(); setState('sample'); prepareSession('sample');
  ui.referenceText.textContent = manifest?.sampleText || '';
  try {
    const response = await fetch(new URL('./sample.wav', import.meta.url));
    if (!response.ok) throw new Error('找不到 sample.wav，请上传完整项目目录。');
    const buffer = await response.arrayBuffer(); sessionStarted = performance.now();
    const result = await rpc('sample', { sessionId: activeSession, buffer });
    renderText(join(prefix, result.text)); saveSession(result, 'sample'); activeSession = null; setState('ready');
    ui.resultHint.textContent = '合成语音自检完成；* 首字时间为自检处理时间';
    ui.recorderHint.textContent = '自检不代表真实口音识别率，接下来试试麦克风。';
    await checkOfflineCache();
  } catch (error) { await failSession(error); }
}
async function checkOfflineCache() {
  const checkingEngine = selectedEngine, checkingManifest = manifest;
  if (!checkingManifest) { cacheStatus = '正在读取资源清单，模型缓存尚未检查'; updateDeviceInfo(); return; }
  try {
    if (!('caches' in window) || !navigator.serviceWorker?.controller) { cacheStatus = '未启用，当前仍可在线加载并本地识别'; updateDeviceInfo(); return; }
    const cache = await caches.open(`say-it-${VERSION}`);
    const names = ['./index.html','./app.js','./styles.css','./recognizer-worker.js','./whisper-worker.js','./audio-utils.js','./capture-worklet.js','./sample.wav','./asset-manifest.json','./whisper-manifest.json', ...(checkingManifest?.assets || []).map(asset => './' + asset.path)];
    const cached = await Promise.all(names.map(name => cache.match(new URL(name, import.meta.url).href)));
    if (checkingEngine !== selectedEngine) return;
    cacheStatus = cached.every(Boolean) ? '页面、引擎与模型已缓存；系统仍可能清理缓存' : `正在缓存（${cached.filter(Boolean).length}/${names.length}）`;
  } catch { cacheStatus = '缓存不可用，本地识别仍可使用'; }
  updateDeviceInfo();
}
async function registerOffline() {
  if (!navigator.serviceWorker || !isSecureContext) { cacheStatus = '当前环境不支持离线缓存'; updateDeviceInfo(); return; }
  try {
    await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './' });
    navigator.serviceWorker.addEventListener('controllerchange', () => { void checkOfflineCache(); });
    navigator.serviceWorker.addEventListener('message', ({ data }) => { if (data.type === 'cached') void checkOfflineCache(); });
    log('离线缓存已注册，资源仅从本网站获取'); await checkOfflineCache();
  } catch (error) { cacheStatus = '离线缓存注册失败，当前可在线加载'; log(`缓存：${error.message}`); updateDeviceInfo(); }
}

ui.primaryButton.addEventListener('click', () => {
  if (state === 'idle' || state === 'error') void loadModel();
  else if (state === 'ready') void startRecording();
  else if (state === 'recording') void stopRecording();
});
ui.sampleButton.addEventListener('click', () => { void runSample(); });
$('nextPrompt').addEventListener('click', () => { promptIndex = (promptIndex + 1) % prompts.length; $('practicePrompt').textContent = prompts[promptIndex]; });
ui.clearButton.addEventListener('click', () => { if (['idle','ready','error'].includes(state)) { renderText(''); prefix = ''; ui.sampleReference.hidden = true; ui.resultHint.textContent = '文字已清空，准备好就开始下一句'; } });
ui.copyButton.addEventListener('click', async () => {
  const text = join(savedText, latestPartial);
  try {
    await navigator.clipboard.writeText(text); ui.copyButton.textContent = '已复制 ✓';
    setTimeout(() => { ui.copyButton.textContent = '复制文字 ⧉'; }, 1800);
  } catch {
    const selection = getSelection(), range = document.createRange(); range.selectNodeContents($('transcript'));
    selection.removeAllRanges(); selection.addRange(range); ui.resultHint.textContent = '请长按选中的文字，选择“复制”';
  }
});
ui.exportButton.addEventListener('click', () => {
  const data = { version: VERSION, selectedEngine, comparison:engineHistory, exportedAt: new Date().toISOString(), userAgent: navigator.userAgent, secureContext: isSecureContext, captureMethod, cacheStatus, metrics, transcript: join(savedText, latestPartial), sessions, logs, model: manifest?.model, runtimeVersion: manifest?.runtimeVersion };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'say-it-device-check.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'recording') void stopRecording('页面切到后台，已自动结束本轮录音。');
  else if (document.hidden && state === 'requesting') { setState('ready'); void cleanupCapture(); }
});
window.addEventListener('pagehide', () => { capture?.media?.getTracks().forEach(track => track.stop()); void cleanupCapture(); });

function updateEngineUI() {
  document.querySelectorAll('[data-engine]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.engine === selectedEngine)); });
  $('engineDescription').textContent = ENGINES[selectedEngine].description;
  manifest = manifests.get(selectedEngine) || null;
  ui.downloadNote.textContent = manifest ? `此引擎首次下载约 ${(manifest.totalBytes / 1000000).toFixed(1)} MB；只加载所选模型，录音不上传。` : '仅加载所选引擎，模型资源可缓存在本机。';
  updateDeviceInfo();
}
function renderComparison() {
  const container = $('comparisonResults'); container.replaceChildren();
  for (const [id, profile] of Object.entries(ENGINES)) {
    const result = engineHistory[id].latest;
    const card = document.createElement('article'); card.className = 'comparison-card'; card.dataset.engineResult = id;
    const heading = document.createElement('h3'); heading.textContent = profile.label;
    const meta = document.createElement('p'); meta.className = 'comparison-meta';
    meta.textContent = result ? `${result.mode === 'sample' ? '同一段合成语音自检' : '最近一次麦克风输入'} · 首字 ${result.firstWordMs == null ? '—' : formatMs(result.firstWordMs)}${result.mode === 'sample' ? ' *' : ''} · 计算比 ${result.rtf.toFixed(2)}` : '尚未测试';
    const text = document.createElement('p'); text.className = 'comparison-text'; text.lang = 'en'; text.textContent = result?.text || 'Run a self-check to compare.';
    card.append(heading, meta, text); container.append(card);
  }
  const bothSamples = Object.values(engineHistory).every(history => history.latest?.mode === 'sample');
  $('comparisonHint').textContent = bothSamples ? '两项均为同一段示例。* 首字是自检处理时间；录音模式更适合比较交互延迟。' : '依次切换引擎并点击“示例音频自检”，即可用同一段英语对照。不同录音的数字不宜直接比较。';
}
document.querySelectorAll('[data-engine]').forEach(button => button.addEventListener('click', () => {
  const target = button.dataset.engine;
  if (target === selectedEngine || !['idle','ready','error'].includes(state)) return;
  engineHistory[selectedEngine].text = savedText;
  destroyWorker(); selectedEngine = target; metrics = {}; firstWordMs = null; captureMethod = '尚未录音'; cacheStatus = '正在检查';
  savedText = engineHistory[target].text; prefix = ''; latestPartial = '';
  hideError(); setState('idle'); updateEngineUI(); renderText(savedText);
  for (const id of ['loadMetric','firstWordMetric','rtfMetric','queueMetric']) ui[id].textContent = '—';
  ui.sampleReference.hidden = true; ui.resultHint.textContent = '所选引擎尚未加载，上一项结果保留在对照卡中';
  ui.inputLabel.textContent = target === 'whisper' ? 'WHISPER TINY.EN' : 'ZIPFORMER'; ui.durationLabel.textContent = '00:00';
  log(`切换到 ${ENGINES[target].label}，已关闭上一个 Worker`); void checkOfflineCache();
}));
setState('idle'); updateEngineUI(); renderComparison(); log(`Say it ${VERSION} · 准备就绪，尚未申请麦克风权限`);
for (const [id, profile] of Object.entries(ENGINES)) {
  fetch(new URL('./' + profile.manifest, import.meta.url)).then(response => { if (!response.ok) throw new Error(`${profile.label} 资源清单缺失`); return response.json(); }).then(data => {
    manifests.set(id, data); if (id === selectedEngine) { updateEngineUI(); void checkOfflineCache(); }
  }).catch(error => { log(error.message); });
}
if (!isSecureContext) showError(new DOMException('HTTPS required', 'SecurityError'));
void registerOffline();
