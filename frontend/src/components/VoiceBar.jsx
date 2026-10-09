import { useEffect, useState } from 'react';
import micOffIcon from '../assets/mito/mic-off.svg';
import micWhiteIcon from '../assets/mito/mic-white.svg';
import stopIcon from '../assets/mito/stop.svg';
import { Waveform } from './Waveform';

const STATUS_LABELS = {
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// The Mito "Chat - voice" bottom bar (#640099): call timer + live waveform on
// top, then the call controls -- mute/unmute the mic, "Stop" (only while the
// agent is thinking or speaking: cuts the reply off, call stays open), and
// "End call" (hangs up and brings the chat input back). Replaces the
// composer for as long as a voice call is up; the turns themselves land in
// the chat log above it, and ListeningOrb shows who's talking.
export function VoiceBar({ status, isMuted, onToggleMute, onStop, onEndCall }) {
  const [elapsed, setElapsed] = useState(0);
  const connecting = status === 'connecting';
  const agentActive = status === 'thinking' || status === 'speaking';

  useEffect(() => {
    if (connecting) return undefined;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [connecting]);

  const waveMode = connecting || isMuted ? 'idle' : status;

  return (
    <div className="voice-bar" role="region" aria-label="Voice call">
      <div className="voice-bar__inner">
        <div className="voice-bar__track">
          <span className="voice-bar__time">{connecting ? '0:00' : formatElapsed(elapsed)}</span>
          <Waveform mode={waveMode} />
        </div>
        <p className="visually-hidden" aria-live="polite">
          {isMuted ? 'Microphone muted' : STATUS_LABELS[status] || 'On call'}
        </p>
        <div className="voice-bar__controls">
          <button
            type="button"
            className="voice-control"
            onClick={onToggleMute}
            disabled={connecting}
            aria-pressed={isMuted}
          >
            <span className="voice-control__icon">
              {isMuted ? (
                <img src={micOffIcon} width="24" height="24" alt="" />
              ) : (
                <img src={micWhiteIcon} width="13" height="21" alt="" />
              )}
            </span>
            <span className="voice-control__label">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {agentActive && (
            <button type="button" className="voice-control" onClick={onStop}>
              <img src={stopIcon} width="38" height="38" alt="" />
              <span className="voice-control__label">Stop</span>
            </button>
          )}

          <button type="button" className="end-call-button" onClick={onEndCall}>
            End call
          </button>
        </div>
      </div>
    </div>
  );
}
