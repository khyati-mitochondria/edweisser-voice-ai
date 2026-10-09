import arrowRightIcon from '../assets/mito/arrow-right.svg';
import micPurpleIcon from '../assets/mito/mic-purple.svg';

// Enterprise "Ask Axon" input row: a wide pill with the small Mito mic tucked
// in at its right edge (starts a voice call), then the round purple send.
export function Composer({ agentName, value, onChange, onSubmit, onMicClick, disabled }) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="composer__field">
        <input
          className="composer__input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Ask ${agentName}`}
          aria-label={`Ask ${agentName}`}
          enterKeyHint="send"
          disabled={disabled}
        />
        <button type="button" className="icon-button composer__mic" onClick={onMicClick} aria-label="Start voice call" title="Talk to Edweisser">
          <img src={micPurpleIcon} width="13" height="21" alt="" />
        </button>
      </div>
      <button type="submit" className="composer__send" disabled={disabled} aria-label="Send">
        <img src={arrowRightIcon} width="24" height="24" alt="" />
      </button>
    </form>
  );
}
