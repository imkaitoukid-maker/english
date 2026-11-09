// Web Speech API runs in the window, using the browser/system speech service.
// Do not request a second getUserMedia stream or start an AudioContext here:
// Safari/Android manage their own microphone and permission UI for this API.
const join = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

export function nativeSpeechSupport(scope = globalThis) {
  const apiName = typeof scope.SpeechRecognition === 'function' ? 'SpeechRecognition'
    : typeof scope.webkitSpeechRecognition === 'function' ? 'webkitSpeechRecognition' : '';
  return { supported:Boolean(apiName), apiName, Constructor:apiName ? scope[apiName] : null };
}

export function nativeSpeechError(code) {
  return ({
    'not-allowed':'麦克风或语音识别权限未获允许。请在浏览器的网站权限中允许后再试；iPhone/iPad 还需检查 Siri 设置。',
    'service-not-allowed':'浏览器的语音服务不可用或被系统禁止。请尝试 Safari / Android Chrome，或切换到本地模型。',
    'network':'无法连接浏览器的语音服务。请检查网络；Android Edge 可尝试改用 Chrome，也可切换本地模型。',
    'audio-capture':'浏览器无法使用麦克风，请检查设备、权限，以及是否被其他应用占用。',
    'language-not-supported':'当前语音服务不支持 en-US 英语。请检查系统语音语言或切换本地模型。',
    'no-speech':'没有检测到语音，请靠近麦克风后再试一句。',
    'unsupported':'当前浏览器没有提供语音识别接口。请用 Safari / Android Chrome 打开，或切换本地模型。',
    'start-timeout':'等待语音服务启动超时。请检查权限和网络后重试，或换用 Safari / Android Chrome。',
    'stop-timeout':'语音服务结束响应超时，已取消本轮并保留收到的文字。',
    'start-failed':'语音服务未能启动，请结束其他语音输入后重试。',
  })[code] || `语音识别未完成（${code || 'unknown'}），可以重新开始或切换本地模型。`;
}

export class NativeSpeechSession {
  constructor({ onStart=()=>{}, onResult=()=>{}, onEnd=()=>{}, onLog=()=>{}, scope=globalThis,
    startupTimeout=30000, stopTimeout=5000 } = {}) {
    this.callbacks={onStart,onResult,onEnd,onLog};this.scope=scope;
    this.startupTimeout=startupTimeout;this.stopTimeout=stopTimeout;
    this.closed=false;this.started=false;this.startedAt=null;this.finalText='';this.interimText='';
    this.errorCode='';this.reason='';this.recognition=null;this.timers=[];
  }
  now() { return this.scope.performance.now(); }
  later(callback, delay) { const id=this.scope.setTimeout(callback,delay);this.timers.push(id);return id; }
  start() {
    if(this.recognition || this.closed)throw new Error('此轮识别已经使用，请重新开始。');
    const support=nativeSpeechSupport(this.scope);this.apiName=support.apiName;
    if(!support.supported){this.errorCode='unsupported';this.finish();return;}
    try {
      const recognition=this.recognition=new support.Constructor();
      recognition.lang='en-US';
      // One short utterance per click works with Android's automatic endpointing.
      // continuous=true is intentionally not required for either target browser.
      recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
      recognition.onstart=()=>{
        // Permission dialogs can outlive a cancel, background event or timeout.
        if(this.closed){try{recognition.abort();}catch{}return;}
        this.started=true;this.startedAt=this.now();
        this.scope.clearTimeout(this.startTimer);
        this.callbacks.onStart({apiName:this.apiName,language:'en-US'});
      };
      recognition.onresult=event=>{
        if(this.closed)return;
        const final=[],interim=[];
        // Results is the complete session snapshot, including revisions. Rebuild
        // it instead of appending repeated Android/Safari final events twice.
        for(let i=0;i<event.results.length;i++){
          const result=event.results[i], text=result[0]?.transcript || '';
          (result.isFinal ? final : interim).push(text);
        }
        this.finalText=join(...final);this.interimText=join(...interim);
        this.callbacks.onResult({committed:this.finalText,partial:this.interimText});
      };
      recognition.onerror=event=>{
        if(this.closed)return;
        const code=event.error || 'unknown';
        if(code==='aborted' && this.reason){this.finish();return;}
        if(!this.errorCode)this.errorCode=code;
        this.callbacks.onLog(`浏览器语音错误：${code}`);
        // Most implementations send end immediately after error, but don't lock
        // the UI indefinitely if a mobile service omits the end event.
        this.later(()=>{this.abortService();this.finish();},1200);
      };
      recognition.onend=()=>{if(!this.closed)this.finish();};
      this.startTimer=this.later(()=>{
        if(this.closed || this.started)return;
        this.errorCode='start-timeout';this.reason='timeout';this.abortService();this.finish();
      },this.startupTimeout);
      // Must remain synchronous in the user's click handler for iOS activation.
      recognition.start();
    } catch(error) {
      this.errorCode=error.name==='NotAllowedError' ? 'not-allowed' : 'start-failed';
      this.callbacks.onLog(`启动语音服务：${error.message || String(error)}`);
      this.finish();
    }
  }
  stop(reason='user') {
    if(this.closed)return;
    this.reason=reason;
    if(!this.started){this.abortService();this.finish();return;}
    try{this.recognition.stop();}catch{this.abortService();this.finish();return;}
    if(!this.closed)this.later(()=>{
      if(this.closed)return;
      this.errorCode='stop-timeout';this.abortService();this.finish();
    },this.stopTimeout);
  }
  abortService() { try{this.recognition?.abort();}catch{} }
  cancel(notify=true, reason='cancelled') {
    if(this.closed)return;
    this.reason=reason;
    // Close first: a synchronous abort/end must not invoke callbacks twice.
    this.finish(notify);this.abortService();
  }
  finish(notify=true) {
    if(this.closed)return;
    this.closed=true;this.timers.forEach(id=>this.scope.clearTimeout(id));this.timers=[];
    if(!notify)return;
    this.callbacks.onEnd({
      text:join(this.finalText,this.interimText),finalText:this.finalText,interimText:this.interimText,
      usedInterim:Boolean(this.interimText),errorCode:this.errorCode,
      stopReason:this.reason || (this.errorCode ? 'error' : 'browser-end'),
      durationSeconds:this.startedAt==null ? 0 : Math.max(0,(this.now()-this.startedAt)/1000),
      apiName:this.apiName || '',language:'en-US',computeMs:null,rtf:null,
      heapBytes:null,heapUnavailable:true,processing:'browser-managed; may use an online speech service',
    });
  }
}
