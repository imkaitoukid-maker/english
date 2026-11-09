/* Shared by the recognition Worker and the local verification tools. */
(() => {
  'use strict';
  function parsePcmWave(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const fourcc = (offset) => String.fromCharCode(...new Uint8Array(arrayBuffer, offset, 4));
    if (view.byteLength < 44 || fourcc(0) !== 'RIFF' || fourcc(8) !== 'WAVE') throw new Error('示例音频不是有效 WAV');
    let format, channels, sampleRate, bits, dataOffset, dataBytes;
    for (let offset = 12; offset + 8 <= view.byteLength;) {
      const name = fourcc(offset), size = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + size > view.byteLength) throw new Error('WAV 音频不完整');
      if (name === 'fmt ' && size >= 16) {
        format = view.getUint16(start, true); channels = view.getUint16(start + 2, true);
        sampleRate = view.getUint32(start + 4, true); bits = view.getUint16(start + 14, true);
      } else if (name === 'data') { dataOffset = start; dataBytes = size; }
      offset = start + size + (size % 2);
    }
    if (format !== 1 || bits !== 16 || !channels || dataOffset == null || !sampleRate) throw new Error('示例需为 16-bit PCM WAV');
    const frames = Math.floor(dataBytes / (2 * channels)), samples = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 32768;
      samples[i] = sum / channels;
    }
    return { samples, sampleRate, duration: samples.length / sampleRate };
  }
  globalThis.SayItAudio = { parsePcmWave };
})();
