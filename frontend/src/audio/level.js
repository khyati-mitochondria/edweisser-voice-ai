// Root-mean-square loudness of an AnalyserNode's current window, scaled into
// a rough 0..1 range (speech RMS rarely goes above ~0.3, so it's boosted).
export function readLevel(analyser, buffer) {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
}
