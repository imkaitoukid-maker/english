/* Shared by the recognition Worker and the local verification tools. */
(() => {
  'use strict';
  // Windowed-sinc streaming resampler for the Whisper path, which requires
  // 16 kHz PCM. sherpa-onnx continues using its own native resampler.
  class StreamingResampler {
    constructor(inputRate, outputRate = 16000) {
      if (!Number.isFinite(inputRate) || inputRate < 8000 || inputRate > 192000) throw new Error('不支持的录音采样率');
      this.inputRate = inputRate; this.outputRate = outputRate;
      this.half = 24; this.buffer = new Float32Array(this.half); this.position = this.half;
      this.ratio = inputRate / outputRate; this.cutoff = Math.min(1, outputRate / inputRate) * 0.94;
      this.totalInput = 0; this.totalOutput = 0;
    }
    process(input, flushing = false) {
      if (!flushing) this.totalInput += input.length;
      if (this.inputRate === this.outputRate) { this.totalOutput += input.length; return input; }
      const joined = new Float32Array(this.buffer.length + input.length);
      joined.set(this.buffer); joined.set(input, this.buffer.length);
      const limit = Math.round(this.totalInput / this.ratio);
      const output = new Float32Array(Math.max(0, Math.min(limit - this.totalOutput, Math.ceil(joined.length / this.ratio))));
      let count = 0;
      while (this.position + this.half < joined.length && this.totalOutput + count < limit) {
        const center = Math.floor(this.position);
        let sum = 0, norm = 0;
        for (let j = center - this.half + 1; j <= center + this.half; j++) {
          const distance = this.position - j, x = Math.PI * distance * this.cutoff;
          const sinc = Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x;
          const weight = sinc * this.cutoff * (0.5 + 0.5 * Math.cos(Math.PI * distance / this.half));
          sum += joined[j] * weight; norm += weight;
        }
        output[count++] = sum / norm; this.position += this.ratio;
      }
      this.totalOutput += count;
      const consumed = Math.max(0, Math.floor(this.position) - this.half);
      this.buffer = joined.slice(consumed); this.position -= consumed;
      return output.slice(0, count);
    }
    flush() {
      if (this.inputRate === this.outputRate) return new Float32Array(0);
      return this.process(new Float32Array(this.half * 2 + 4), true);
    }
  }
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
  globalThis.SayItAudio = { parsePcmWave, StreamingResampler };
})();
