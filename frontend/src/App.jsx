import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import micPurpleIcon from './assets/mito/mic-purple.svg';
import plusBoldIcon from './assets/mito/plus-bold.svg';
import { ChatMessage } from './components/ChatMessage';
import { Composer } from './components/Composer';
import { ListeningOrb } from './components/ListeningOrb';
import { TypingDots } from './components/TypingDots';
import { VoiceBar } from './components/VoiceBar';
import { useAudioLevel } from './hooks/useAudioLevel';
import { useVoiceCall } from './hooks/useVoiceCall';

const BACKEND_HTTP_URL = import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000';
const AGENT_NAME = 'Edweisser';
const AGENT_ROLE = 'Mutual Fund Advisor';

function App() {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const startedSessionRef = useRef(null);
  const chatLogRef = useRef(null);
  const dockRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // startCall() is async (websocket connect -> mic permission -> audio
  // worklet setup); isConnecting covers that window so the UI can show
  // "Connecting..." before the call is actually live.
  const [isConnecting, setIsConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState('listening');
  const [voiceError, setVoiceError] = useState(null);

  const appendMessage = useCallback((role, text, demoActions, viaVoice) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text, demoActions, viaVoice, createdAt: new Date() }]);
  }, []);

  // Edweisser greets first, before the user says anything. Keyed on
  // sessionId so "new chat" gets a fresh greeting; the ref keeps StrictMode's
  // double effect run from greeting the same session twice, and drops a late
  // reply for a session that's already been replaced.
  useEffect(() => {
    if (startedSessionRef.current === sessionId) return;
    startedSessionRef.current = sessionId;
    const show = (text) => {
      if (startedSessionRef.current !== sessionId) return;
      appendMessage('assistant', text);
    };
    fetch(`${BACKEND_HTTP_URL}/chat/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((res) => res.json())
      .then((data) => show(data.reply))
      .catch(() => show(`Hi, I'm ${AGENT_NAME}. (Couldn't reach the backend just now.)`));
  }, [sessionId, appendMessage]);

  const handleStatusChange = useCallback((status) => setCallStatus(status), []);
  const handleVoiceError = useCallback((message) => setVoiceError(message), []);
  // Folds each finalized voice-call turn into the same chat log used for
  // typed messages, tagged viaVoice so ChatMessage can show it came from a
  // call.
  const handleVoiceTranscript = useCallback(
    ({ role, text, demoActions }) => appendMessage(role, text, demoActions, true),
    [appendMessage],
  );

  const { isCallActive, isMuted, startCall, endCall, toggleMute, interrupt, getLevels } = useVoiceCall({
    sessionId,
    onStatusChange: handleStatusChange,
    onError: handleVoiceError,
    onTranscript: handleVoiceTranscript,
  });

  const onCall = isCallActive || isConnecting;
  const voiceStatus = isConnecting ? 'connecting' : callStatus;
  const agentBusy = sending || (onCall && callStatus === 'thinking');
  const levelSource = voiceStatus === 'listening' ? 'user' : voiceStatus === 'speaking' ? 'agent' : null;
  useAudioLevel(dockRef, getLevels, levelSource, isCallActive && !isMuted);

  useEffect(() => {
    const el = chatLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, agentBusy, onCall]);

  const sendText = useCallback(
    async (rawText) => {
      const text = rawText.trim();
      if (!text || sending) return;
      setDraft('');
      appendMessage('user', text);
      setSending(true);
      try {
        const res = await fetch(`${BACKEND_HTTP_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, text }),
        });
        if (!res.ok) throw new Error(`backend returned ${res.status}`);
        const data = await res.json();
        appendMessage('assistant', data.reply, data.demo_actions);
      } catch {
        appendMessage('assistant', 'Sorry, something went wrong reaching the advisor.');
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending, appendMessage],
  );

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      sendText(draft);
    },
    [draft, sendText],
  );

  const handleMicClick = useCallback(() => {
    setVoiceError(null);
    setCallStatus('listening');
    setIsConnecting(true);
    startCall()
      .catch((err) => {
        console.error('Failed to start voice call', err);
        setVoiceError(`Could not start the voice call — ${err.name || 'Error'}: ${err.message || err}`);
      })
      .finally(() => setIsConnecting(false));
  }, [startCall]);

  const handleNewChat = useCallback(() => {
    if (onCall) endCall();
    setMessages([]);
    setDraft('');
    setVoiceError(null);
    setSessionId(crypto.randomUUID());
  }, [onCall, endCall]);

  return (
    <div className="app">
      <nav className="topbar">
        <div className="topbar__inner">
          <span className="topbar__logo">mitochondria</span>
          <span className="topbar__divider" aria-hidden="true" />
          <span className="topbar__product">Console</span>
        </div>
      </nav>

      <section className="agent-hero">
        <div className="agent-hero__inner">
          <div className="agent-hero__tile" aria-hidden="true">
            <img src={micPurpleIcon} width="17" height="27" alt="" />
          </div>
          <div className="agent-hero__title">
            <h1 className="agent-hero__name">{AGENT_NAME}</h1>
            <p className="agent-hero__role">{AGENT_ROLE}</p>
          </div>
          <button type="button" className="pill-button" onClick={handleNewChat}>
            New Chat
            <img src={plusBoldIcon} width="20" height="20" alt="" />
          </button>
        </div>
      </section>

      <main className="chat-log" ref={chatLogRef}>
        <div className="chat-log__inner">
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              role={m.role}
              text={m.text}
              agentName={AGENT_NAME}
              createdAt={m.createdAt}
              demoActions={m.demoActions}
              viaVoice={m.viaVoice}
            />
          ))}
          {agentBusy && <TypingDots />}
        </div>
      </main>

      <footer className={`dock${onCall ? ' dock--call' : ''}`} ref={dockRef}>
        {voiceError && <div className="error-banner">{voiceError}</div>}
        {onCall && <ListeningOrb status={voiceStatus} isMuted={isMuted} agentName={AGENT_NAME} />}
        {onCall ? (
          <VoiceBar
            status={voiceStatus}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onStop={interrupt}
            onEndCall={endCall}
          />
        ) : (
          <Composer
            agentName={AGENT_NAME}
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            onMicClick={handleMicClick}
            disabled={sending}
          />
        )}
      </footer>
    </div>
  );
}

export default App;
