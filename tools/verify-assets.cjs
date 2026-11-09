const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const names=['asset-manifest.json','whisper-manifest.json','whisper-base-manifest.json','whisper-cpp-manifest.json'];
const manifests=names.map(name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8')));
const unique=new Map();
for(const [index,manifest]of manifests.entries()){
  assert.equal(manifest.version,'1.2.0','Manifest version mismatch');
  let total=0;
  for(const asset of manifest.assets){
    const target=path.resolve(root,asset.path);assert(target.startsWith(root+path.sep),'Asset outside project');
    const data=fs.readFileSync(target);
    assert.equal(data.length,asset.bytes,`Size mismatch: ${asset.path}`);
    assert.equal(hash(data),asset.sha256,`Hash mismatch: ${asset.path}`);
    assert(data.length<25*1024*1024,`Exceeds GitHub browser upload limit: ${asset.path}`);
    total+=data.length;
    if(unique.has(asset.path))assert.equal(unique.get(asset.path).sha256,asset.sha256,'Shared runtime mismatch');
    unique.set(asset.path,asset);
  }
  assert.equal(total,manifest.totalBytes,`Total mismatch: ${names[index]}`);
  for(const file of manifest.modelFiles||[]){
    const data=Buffer.concat(file.parts.map(part=>fs.readFileSync(path.join(root,part))));
    if(file.bytes!=null)assert.equal(data.length,file.bytes);
    if(file.sha256)assert.equal(hash(data),file.sha256,`Reconstructed model mismatch: ${file.path}`);
  }
  if(manifest.modelParts){
    const data=Buffer.concat(manifest.modelParts.map(part=>fs.readFileSync(path.join(root,part))));
    assert.equal(data.length,manifest.modelBytes);
    if(manifest.modelSha256)assert.equal(hash(data),manifest.modelSha256);
  }
  console.log(`OK ${names[index]}: ${manifest.model}; ${(total/1e6).toFixed(1)} MB cold-load assets`);
}
const [sherpa,,,cpp]=manifests;
assert(fs.readFileSync(path.join(root,'vendor/sherpa-onnx-wasm-main-asr.js'),'utf8').includes(`"remote_package_size":${sherpa.modelBytes}`));
assert.equal(cpp.build.pthreads,false);
for(const name of ['index.html','app.js','styles.css','audio-utils.js','capture-worklet.js','recognizer-worker.js','whisper-worker.js','whisper-cpp-worker.js','whisper-session.js','sw.js','sample.wav','.nojekyll'])assert(fs.existsSync(path.join(root,name)),`Missing ${name}`);
require(path.join(root,'audio-utils.js'));
const sample=fs.readFileSync(path.join(root,'sample.wav'));
const wave=SayItAudio.parsePcmWave(sample.buffer.slice(sample.byteOffset,sample.byteOffset+sample.length));
assert.equal(wave.sampleRate,16000);assert(wave.duration>5&&wave.duration<10);
console.log(`Verified ${unique.size} unique runtime/model assets, ${(Array.from(unique.values()).reduce((n,a)=>n+a.bytes,0)/1e6).toFixed(1)} MB; original weights and all shards match SHA-256.`);
