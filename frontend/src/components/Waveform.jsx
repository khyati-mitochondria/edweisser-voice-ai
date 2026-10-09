// Bar geometry exported from the Mito Figma voice bar ("Chat - voice",
// node 58157:945): each `Mx y1Vy2` segment is one vertical bar. Kept as
// individual <line>s rather than one path so each bar can animate on its own.
const BAR_PATH =
  'M43.9115 1V25M133.551 1V25M139.413 1V25M60.4827 1V25M48.9863 4.63217V21.3678M128.273 4.63217V21.3678M38.8451 4.63217V21.3678M55.0527 8.76948V17.2305M65.9127 8.76948V17.2305M118.457 8.76948V17.2305M123.369 8.76948V17.2305M144.691 8.76948V17.2305M149.156 8.76948V17.2305M71.3428 10.9464V15.0476M114.147 10.9464V15.0476M154.543 10.9464V15.0476M159.939 10.9464V15.0476M76.7728 11.7762V14.2177M20.9226 11.7762V14.2177M82.2028 12.3896V13.6104M85.393 12.3896V13.6104M88.5916 12.3896V13.6104M91.7817 12.3896V13.6104M94.9803 12.3896V13.6104M98.1705 12.3896V13.6104M101.369 12.3896V13.6104M104.559 12.3896V13.6104M107.758 12.3896V13.6104M163.409 12.3896V13.6104M166.88 12.3896V13.6104M170.358 12.3896V13.6104M173.828 12.3896V13.6104M177.298 12.3896V13.6104M180.769 12.3896V13.6104M184.247 12.3896V13.6104M187.717 12.3896V13.6104M191.187 12.3896V13.6104M194.658 12.3896V13.6104M198.136 12.3896V13.6104M201.606 12.3896V13.6104M205.076 12.3896V13.6104M208.555 12.3896V13.6104M212.025 12.3896V13.6104M215.495 12.3896V13.6104M218.965 12.3896V13.6104M222.444 12.3896V13.6104M225.914 12.3896V13.6104M229.384 12.3896V13.6104M232.854 12.3896V13.6104M236.333 12.3896V13.6104M239.803 12.3896V13.6104M243.273 12.3896V13.6104M246.743 12.3896V13.6104M250.222 12.3896V13.6104M253.692 12.3896V13.6104M257.162 12.3896V13.6104M260.641 12.3896V13.6104M264.111 12.3896V13.6104M267.581 12.3896V13.6104M271.051 12.3896V13.6104M274.53 12.3896V13.6104M278 12.3896V13.6104M110.948 12.3896V13.6104M16.7725 12.3896V13.6104M13.6163 12.3896V13.6104M10.4686 12.3896V13.6104M7.3124 12.3896V13.6104M4.1562 12.3896V13.6104M1 12.3896V13.6104M25.0726 10.9464V15.0476M33.7788 8.76948V17.2305M29.2226 8.76948V17.2305';

const BARS = [...BAR_PATH.matchAll(/M([\d.]+) ([\d.]+)V([\d.]+)/g)]
  .map(([, x, y1, y2]) => ({ x: Number(x), y1: Number(y1), y2: Number(y2) }))
  .sort((a, b) => a.x - b.x);

// `mode` drives the animation: 'speaking' (agent talking) pulses hard,
// 'listening' breathes gently, anything else sits still at the design shape.
export function Waveform({ mode }) {
  return (
    <svg
      className={`waveform waveform--${mode}`}
      width="279"
      height="26"
      viewBox="0 0 279 26"
      // Stretches to whatever width the voice bar gives it (the Figma bar is
      // 279px, the desktop bar is wider); non-scaling strokes below keep the
      // bars at the design's 2px instead of smearing them horizontally.
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="waveform-gradient" x1="-4.78789" y1="19.1909" x2="321.372" y2="12.6085" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFBF1E" />
          <stop offset="0.135937" stopColor="#D98989" />
          <stop offset="0.362812" stopColor="#BA5BAE" />
          <stop offset="0.577397" stopColor="#A82FC4" />
          <stop offset="0.739937" stopColor="#9500DC" />
          <stop offset="0.841006" stopColor="#8100C1" />
          <stop offset="0.906889" stopColor="#640099" />
          <stop offset="1" stopColor="#3F0368" />
        </linearGradient>
      </defs>
      {BARS.map((bar, i) => (
        <line
          key={i}
          className="waveform__bar"
          style={{ animationDelay: `${(i % 9) * -0.11}s` }}
          x1={bar.x}
          x2={bar.x}
          y1={bar.y1}
          y2={bar.y2}
          stroke="url(#waveform-gradient)"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
