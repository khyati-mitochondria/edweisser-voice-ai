const CAPTIONS = {
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
};

// The voice-call orb in Mito colours. It floats above the voice bar and
// breathes with the live `--level` CSS variable (set by useAudioLevel on a
// parent): the customer's mic while listening, the agent's audio while
// speaking. Thinking spins the ring; muted greys it out.
export function ListeningOrb({ status, isMuted, agentName }) {
  const state = isMuted ? 'muted' : status;
  const caption = isMuted
    ? 'Mic muted'
    : status === 'speaking'
      ? `${agentName} is speaking`
      : CAPTIONS[status] || 'On call';

  return (
    <div className={`orb orb--${state}`} aria-hidden="true">
      <div className="orb__glow" />
      <div className="orb__ring" />
      <div className="orb__core" />
      <p className="orb__caption">{caption}</p>
    </div>
  );
}
