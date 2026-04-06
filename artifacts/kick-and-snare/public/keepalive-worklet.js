// KeepAlive AudioWorklet — keeps the audio rendering thread active between hits.
// Without this, the Android OS suspends the audio thread during silence, causing
// a buffer underrun (crackling) on the next hit. This worklet outputs silence but
// runs continuously, preventing the thread from sleeping.
class KeepAliveProcessor extends AudioWorkletProcessor {
  process(_inputs, outputs) {
    const out = outputs[0];
    if (out && out[0]) out[0].fill(0);
    return true; // returning true keeps the worklet alive indefinitely
  }
}
registerProcessor('ks-keepalive', KeepAliveProcessor);
