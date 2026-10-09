import { readLevel } from './level';

// Schedules incoming PCM16 mono chunks back-to-back for gapless playback,
// and can stop everything instantly on barge-in.
export class PcmAudioPlayer {
  constructor(sampleRate = 16000) {
    this.sampleRate = sampleRate;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.nextStartTime = 0;
    this.activeSources = [];
    // Every chunk plays through this analyser so the UI can read how loud
    // the agent currently is (see level()).
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.audioContext.destination);
    this.levelBuffer = new Float32Array(this.analyser.fftSize);
  }

  level() {
    return readLevel(this.analyser, this.levelBuffer);
  }

  enqueue(arrayBuffer) {
    const pcm16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x8000;
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser);

    const now = this.audioContext.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    };
  }

  clear() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources = [];
    this.nextStartTime = this.audioContext.currentTime;
  }

  async close() {
    this.clear();
    await this.audioContext.close();
  }
}
