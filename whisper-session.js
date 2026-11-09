import './audio-utils.js';
export function installWhisperSession({initialize, transcribe, reportBusy=false, runtimeStats = () => ({heapBytes:null,heapUnavailable:true})}) {
let initialized=false, initialization=null, session=null;
const RATE=16000, UPDATE_SAMPLES=3*RATE, PAUSE_SAMPLES=1.6*RATE;
const report=(type,data={})=>self.postMessage({type,...data});
const join=(...parts)=>parts.filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
function begin(id, rate, initialPrompt = '') {
  if (!initialized) throw new Error('请先加载 Whisper 模型。');
  session = { id, rate, initialPrompt:String(initialPrompt).slice(0,2000), resampler:new SayItAudio.StreamingResampler(rate), chunks:[], length:0, offset:0, accepted:0, recognized:0, committed:'', partial:'', voice:0, lastVoice:0, lastSnapshot:0, computeMs:0, inFlight:null, finishing:false, lastReport:0 };
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
  report('result', { sessionId:s.id, committed:s.committed, partial:s.partial, inputSeconds:s.recognized / RATE, computeMs:s.computeMs, rtf:s.recognized ? s.computeMs / 1000 / (s.recognized / RATE) : 0, ...runtimeStats() });
}
async function infer(s, commit) {
  const length = s.length, offset = s.offset, snapshot = combine(s.chunks, length);
  s.lastSnapshot = s.accepted;
  const began = performance.now();
  let output;
  try {
    if (reportBusy) report('busy', {sessionId:s.id,busy:true});
    output = await transcribe(snapshot, s.initialPrompt);
  } finally {
    if (reportBusy) report('busy', {sessionId:s.id,busy:false});
  }
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
  const response = { sessionId:s.id, text:s.committed, inputSeconds:s.accepted / RATE, computeMs:s.computeMs, rtf:s.accepted ? s.computeMs / 1000 / (s.accepted / RATE) : 0, ...runtimeStats(), initialPrompt:s.initialPrompt };
  session = null; return response;
}
self.onmessage = async ({data}) => {
  try {
    let response;
    switch (data.type) {
      case 'init': initialization ||= initialize(data); response = await initialization; initialized = true; break;
      case 'begin': begin(data.sessionId, data.sampleRate, data.initialPrompt); response = {sessionId:data.sessionId}; break;
      case 'audio': accept(data); return;
      case 'finish':
        if (session?.id !== data.sessionId) throw new Error('识别会话已结束。');
        // A synchronous WASM inference cannot consume incoming messages while
        // computing. The main thread sends its held PCM with the finish request.
        if (data.buffer) appendAudio(session, session.resampler.process(new Float32Array(data.buffer)));
        response = await finish(); break;
      case 'sample': {
        const wave = SayItAudio.parsePcmWave(data.buffer); begin(data.sessionId, wave.sampleRate, data.initialPrompt);
        const s = session, began = performance.now();
        appendAudio(s, s.resampler.process(wave.samples)); s.computeMs += performance.now() - began;
        response = await finish(); break;
      }
      default: throw new Error('未知 Whisper 操作');
    }
    report('reply', {replyTo:data.requestId,response});
  } catch (error) { report('failure', {replyTo:data.requestId,message:error.message || String(error),fatal:data.type === 'init' || data.type === 'audio'}); }
};

}
