const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-manifest.json'), 'utf8'));
let bytes = 0;
for (const asset of manifest.assets) {
  const file = path.resolve(root, asset.path);
  assert(file.startsWith(root + path.sep), 'Asset path must remain inside the project');
  const data = fs.readFileSync(file);
  assert.equal(data.length, asset.bytes, `Size mismatch: ${asset.path}`);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), asset.sha256, `SHA-256 mismatch: ${asset.path}`);
  assert(data.length < 25 * 1024 * 1024, `File exceeds GitHub browser-upload limit: ${asset.path}`);
  bytes += data.length;
  console.log(`OK ${asset.path} (${data.length} bytes)`);
}
assert.equal(bytes, manifest.totalBytes, 'Total byte count mismatch');
assert.equal(manifest.modelParts.reduce((sum, part) => sum + manifest.assets.find(asset => asset.path === part).bytes, 0), manifest.modelBytes);
const runtime = fs.readFileSync(path.join(root, 'vendor/sherpa-onnx-wasm-main-asr.js'), 'utf8');
assert(runtime.includes(`"remote_package_size":${manifest.modelBytes}`), 'Preload metadata must match the model shards');
for (const name of ['index.html','app.js','styles.css','audio-utils.js','capture-worklet.js','recognizer-worker.js','sw.js','sample.wav','.nojekyll']) assert(fs.existsSync(path.join(root, name)), `Missing ${name}`);
require(path.join(root, 'audio-utils.js'));
const sample = fs.readFileSync(path.join(root, 'sample.wav'));
const wave = SayItAudio.parsePcmWave(sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.length));
assert.equal(wave.sampleRate, 16000);
assert(wave.duration > 5 && wave.duration < 10, 'Unexpected self-check sample');
console.log(`Verified ${manifest.assets.length} runtime/model files; ${(bytes / 1000000).toFixed(1)} MB. Sample: ${wave.duration.toFixed(3)} s.`);
