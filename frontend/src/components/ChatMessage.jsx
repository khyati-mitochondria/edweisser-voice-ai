import { useState } from 'react';
import downloadIcon from '../assets/mito/download.svg';
import thumbsDownIcon from '../assets/mito/thumbs-down.svg';
import thumbsUpIcon from '../assets/mito/thumbs-up.svg';

// Matches `[label](url)`, a bare `http(s)://...` URL, or `**bold**` text, so
// renderFormatted can turn all three into real markup in one pass.
const FORMAT_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|\*\*([^*]+)\*\*/g;

// Agent replies longer than this collapse behind the design's "Read More".
const COLLAPSE_AT = 420;

function renderFormatted(text) {
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = FORMAT_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, linkLabel, linkUrl, bareUrl, boldText] = match;
    if (boldText !== undefined) {
      parts.push(<strong key={key++}>{boldText}</strong>);
    } else {
      const label = linkLabel || bareUrl;
      const url = linkUrl || bareUrl;
      parts.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    }
    lastIndex = FORMAT_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

// Cuts at the last word boundary before `limit` so "Read More" never splits a
// word (or a markdown link) in half.
function truncate(text, limit) {
  let cut = text.lastIndexOf(' ', limit);
  if (cut <= 0) cut = limit;
  for (const m of text.matchAll(FORMAT_RE)) {
    if (m.index < cut && cut < m.index + m[0].length) cut = m.index;
  }
  return text.slice(0, cut).replace(/[\s.,;:]+$/, '');
}

function downloadText(text, createdAt) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edweisser-reply-${createdAt.getTime()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ChatMessage({ role, text, agentName, createdAt, demoActions, viaVoice }) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const isAgent = role === 'assistant';
  const collapsible = isAgent && text.length > COLLAPSE_AT;
  const shown = collapsible && !expanded ? truncate(text, COLLAPSE_AT) : text;

  return (
    <div className={`chat-message chat-message--${role}`}>
      {/* Enterprise layout labels only the agent; a customer turn gets a
          label just when it came from a voice call. */}
      {(isAgent || viaVoice) && (
        <p className="chat-message__author">
          {isAgent ? agentName : 'You'}
          {viaVoice && <span className="chat-message__voice-tag"> · via call</span>}
        </p>
      )}
      <div className="chat-message__bubble">
        <div className="chat-message__text">
          {renderFormatted(shown)}
          {collapsible && !expanded && (
            <>
              …
              <button type="button" className="chat-message__read-more" onClick={() => setExpanded(true)}>
                Read More
              </button>
            </>
          )}
        </div>
        {demoActions?.length > 0 && (
          <div className="chat-message__demo-badges">
            {demoActions.map((action, i) => (
              <span key={i} className="chat-message__demo-badge" title={action.note}>
                Demo action — {action.tool === 'send_email' ? 'no real email sent' : 'no real invite sent'}
              </span>
            ))}
          </div>
        )}
      </div>
      {isAgent && (
        <div className="chat-message__actions">
          <button
            type="button"
            className={`icon-button chat-message__action${feedback === 'up' ? ' is-selected' : ''}`}
            onClick={() => setFeedback((f) => (f === 'up' ? null : 'up'))}
            aria-label="Helpful"
            aria-pressed={feedback === 'up'}
          >
            <img src={thumbsUpIcon} width="18" height="18" alt="" />
          </button>
          <button
            type="button"
            className={`icon-button chat-message__action${feedback === 'down' ? ' is-selected' : ''}`}
            onClick={() => setFeedback((f) => (f === 'down' ? null : 'down'))}
            aria-label="Not helpful"
            aria-pressed={feedback === 'down'}
          >
            <img src={thumbsDownIcon} width="18" height="18" alt="" />
          </button>
          <button
            type="button"
            className="icon-button chat-message__action"
            onClick={() => downloadText(text, createdAt)}
            aria-label="Download reply"
          >
            <img src={downloadIcon} width="18" height="18" alt="" />
          </button>
        </div>
      )}
    </div>
  );
}
