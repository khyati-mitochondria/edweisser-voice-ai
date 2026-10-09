// The Mito "agent is typing" indicator: three purple rings (Figma node
// 58157:752), pulsing in turn.
const RING_CENTERS = [4, 21, 38];

export function TypingDots() {
  return (
    <div className="typing-dots" role="status" aria-label="Agent is responding">
      <svg width="42" height="8" viewBox="0 0 42 8" fill="none" aria-hidden="true">
        {RING_CENTERS.map((cx) => (
          <circle key={cx} className="typing-dots__ring" cx={cx} cy="4" r="2.95" stroke="#640099" strokeWidth="2.1" />
        ))}
      </svg>
    </div>
  );
}
