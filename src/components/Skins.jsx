import { Rich, ImageCard } from './Rich.jsx';
import { copyText } from '../lib/util.js';

const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const mkSkin = (cls, o) =>
  function Skin({ m, children }) {
    const user = m.role === 'user';
    return (
      <div className={'msg sk-' + cls + (user ? ' u' : ' a')}>
        {o.av && <div className="av" aria-hidden="true">{user ? '🧑' : '✨'}</div>}
        <div className="bd">
          {o.hd && <div className="hd">{user ? 'You' : 'Nova'} · {time(m.ts)}</div>}
          {o.pre && <span className="pre">{user ? o.pre : '◆'}</span>}
          {children}
        </div>
      </div>
    );
  };

export const SKINS = {
  classic: ['Classic', mkSkin('classic', { av: 1 })],
  glass: ['Glass', mkSkin('glass', { hd: 1 })],
  terminal: ['Terminal', mkSkin('terminal', { pre: '$' })],
  neon: ['Neon', mkSkin('neon', {})],
  paper: ['Paper', mkSkin('paper', { hd: 1 })],
  bubble: ['Bubble', mkSkin('bubble', {})],
  minimal: ['Minimal', mkSkin('minimal', {})],
  gradient: ['Gradient', mkSkin('gradient', { av: 1 })],
  retro: ['Retro', mkSkin('retro', { pre: '>' })],
  compact: ['Compact', mkSkin('compact', {})],
};

export function Msg({ m, skin, last, busy, onRetry }) {
  const Skin = (SKINS[skin] || SKINS.classic)[1];
  const assistant = m.role === 'assistant';
  return (
    <Skin m={m}>
      {(m.imgs || []).map((u, i) =>
        m.gen ? <ImageCard key={i} src={u} cap={m.cap} /> : <img key={i} className="th" src={u} alt="attachment" />
      )}
      {(m.files || []).map((f, i) => <span key={i} className="chip">📄 {f.name}</span>)}
      {m.text ? <Rich text={m.text} /> : null}
      {m.streaming && (m.text ? <span className="caret" aria-hidden="true" /> : <span className="dots" aria-label="Thinking"><span /><span /><span /></span>)}
      {m.stopped && <div className="hint">Stopped</div>}
      {assistant && !m.streaming && (
        <div className="acts">
          {m.text && !m.err && <button onClick={() => copyText(m.text)} aria-label="Copy reply">Copy</button>}
          {last && !busy && <button onClick={onRetry}>{m.err ? '↻ Retry' : '↻ Regenerate'}</button>}
        </div>
      )}
    </Skin>
  );
}

export function StylePicker({ skin, set }) {
  return (
    <div className="styles" role="group" aria-label="Chat style">
      {Object.entries(SKINS).map(([k, [name]]) => (
        <button key={k} className={skin === k ? 'on' : ''} onClick={() => set(k)}>{name}</button>
      ))}
    </div>
  );
}
