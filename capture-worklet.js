class SayItCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(2048); this.offset = 0; this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'flush') { this.send(); this.active = false; this.port.postMessage({ type: 'flushed' }); }
    };
  }
  send() {
    if (!this.offset) return;
    const samples = this.buffer.slice(0, this.offset);
    let energy = 0;
    for (const value of samples) energy += value * value;
    this.port.postMessage({ type: 'audio', buffer: samples.buffer, rms: Math.sqrt(energy / samples.length) }, [samples.buffer]);
    this.offset = 0;
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const channels = inputs[0];
    if (!this.active || !channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i];
      this.buffer[this.offset++] = mono / channels.length;
      if (this.offset === this.buffer.length) this.send();
    }
    return true;
  }
}
registerProcessor('say-it-capture', SayItCapture);
