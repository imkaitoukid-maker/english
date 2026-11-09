import { installWhisperSession } from './whisper-session.js';
import createWhisperCpp from './vendor/whisper-cpp/whisper-cpp.mjs';

let runtime;
const report = (type, data = {}) => self.postMessage({ type, ...data });
function runtimeStats() {
  return { heapBytes:runtime?.HEAPU8.buffer.byteLength || null, heapUnavailable:false,
    sharedMemory:typeof SharedArrayBuffer === 'function' && runtime?.HEAPU8.buffer instanceof SharedArrayBuffer,
    appliedPrompt:runtime ? runtime.ccall('sayit_prompt','string',[],[]) : '' };
}
async function fetchAsset(asset, previous, total) {
  const controller = new AbortController(); let timeout;
  const reset = () => { clearTimeout(timeout); timeout=setTimeout(()=>controller.abort(),90000); };
  reset();
  try {
    const response=await fetch(new URL(asset.path,self.location.href),{signal:controller.signal});
    if(!response.ok) throw new Error(`whisper.cpp 资源下载失败 (${response.status})：${asset.path}`);
    const bytes=new Uint8Array(asset.bytes);let offset=0;
    if(response.body?.getReader){
      const reader=response.body.getReader();
      while(true){
        const next=await reader.read();if(next.done)break;
        if(offset+next.value.length>bytes.length)throw new Error('whisper.cpp 资源大小不符，请完整更新文件。');
        bytes.set(next.value,offset);offset+=next.value.length;reset();
        report('progress',{stage:'下载 whisper.cpp 引擎与 Q5_1 模型',loaded:previous+offset,total});
      }
    } else {const data=new Uint8Array(await response.arrayBuffer());bytes.set(data);offset=data.length;}
    if(offset!==bytes.length)throw new Error('whisper.cpp 资源不完整：'+asset.path);
    return bytes;
  } catch(error){if(error.name==='AbortError')throw new Error('whisper.cpp 下载连续 90 秒无响应，请检查网络后重试。');throw error;}
  finally{clearTimeout(timeout);}
}
async function initialize({manifest:manifestPath}) {
  const began=performance.now();
  const response=await fetch(new URL(manifestPath,self.location.href));
  if(!response.ok)throw new Error('找不到 whisper.cpp 资源清单，请完整部署新文件。');
  const manifest=await response.json();
  const assets=manifest.assets.filter(a=>!a.path.endsWith('.mjs'));
  const total=assets.reduce((sum,a)=>sum+a.bytes,0);let loaded=0;
  const wasmAsset=assets.find(a=>a.path.endsWith('.wasm'));
  const wasmBytes=await fetchAsset(wasmAsset,loaded,total);loaded+=wasmAsset.bytes;
  runtime=await createWhisperCpp({wasmBinary:wasmBytes,
    print:text=>report('log',{text:String(text)}),
    printErr:text=>report('log',{text:String(text)}),
  });
  // Assemble directly in WASM memory: avoid a second full model copy in JS.
  const modelPtr=runtime._malloc(manifest.modelBytes);
  if(!modelPtr)throw new Error('没有足够内存加载 base.en Q5_1，请关闭其他网页后重试。');
  try {
    let offset=0;
    for(const name of manifest.modelParts){
      const asset=assets.find(a=>a.path===name);
      const part=await fetchAsset(asset,loaded,total);
      runtime.HEAPU8.set(part,modelPtr+offset);offset+=part.length;loaded+=part.length;
    }
    if(offset!==manifest.modelBytes)throw new Error('Q5_1 模型分片总大小不符。');
    report('progress',{stage:'初始化 whisper.cpp 并预热，暂时无需麦克风权限',loaded:total,total});
    if(runtime._sayit_load(modelPtr,manifest.modelBytes)!==0)throw new Error('base.en Q5_1 模型初始化失败。');
  } finally {runtime._free(modelPtr);}
  await transcribe(new Float32Array(8000),'');
  return {loadMs:performance.now()-began,...runtimeStats(),model:manifest.model,runtimeVersion:manifest.runtimeVersion};
}
function transcribe(samples, initialPrompt) {
  const ptr=runtime._malloc(samples.byteLength);
  if(!ptr)throw new Error('没有足够内存处理录音，请缩短句子后重试。');
  try {
    runtime.HEAPF32.set(samples,ptr/4);
    const status=runtime.ccall('sayit_transcribe','number',['number','number','string'],[ptr,samples.length,initialPrompt]);
    if(status!==0)throw new Error(`whisper.cpp 识别失败 (${status})。`);
    return {text:runtime.ccall('sayit_result','string',[],[])};
  } finally {runtime._free(ptr);}
}
installWhisperSession({initialize,transcribe,runtimeStats,reportBusy:true});
