import { useMemo, useState } from 'react';
import { renderMarkdown } from '../lib/markdown.js';
import { copyText, downloadBlob, saveUrl, say } from '../lib/util.js';

const EXT = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', shell: 'sh', '': 'txt' };

export function Code({ lang, code }) {
  const [preview, setPreview] = useState(false);
  const [full, setFull] = useState(false);
  const L = (lang || '').toLowerCase();
  const canPreview = ['html', 'svg', 'js', 'javascript'].includes(L);
  const doc = useMemo(() => {
    if (L === 'svg') return `<body style="margin:0;display:grid;place-items:center;min-height:100vh">${code}</body>`;
    if (L.startsWith('j')) return `<body><script>${code}<\/script></body>`;
    return code;
  }, [L, code]);
  return (
    <div className={'cb' + (full ? ' fs' : '')}>
      <div className="ch">
        <b>{L || 'code'}</b>
        {canPreview && <button onClick={() => setPreview(!preview)}>{preview ? 'Code' : '▶ Preview'}</button>}
        {preview && <button onClick={() => setFull(!full)} aria-label="Toggle fullscreen">{full ? 'Close' : '⤢'}</button>}
        <button onClick={() => copyText(code)}>Copy</button>
        <button onClick={() => downloadBlob(new Blob([code]), 'code.' + (EXT[L] ?? L))} aria-label="Download code">⬇</button>
      </div>
      {preview ? (
        <iframe sandbox="allow-scripts allow-forms allow-modals" srcDoc={doc} title="Preview" />
      ) : (
        <pre>{code}</pre>
      )}
    </div>
  );
}

function Md({ text }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Rich({ text }) {
  const parts = text.split(/```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/);
  const out = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(<Md key={i} text={parts[i]} />);
    if (parts[i + 2] !== undefined) out.push(<Code key={i + 1} lang={parts[i + 1]} code={parts[i + 2].replace(/\n$/, '')} />);
  }
  return out;
}

export function ImageCard({ src, cap }) {
  const [failed, setFailed] = useState(false);
  const share = async () => {
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], 'nova.png', { type: blob.type || 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else if (navigator.share) await navigator.share({ url: src.startsWith('data:') ? location.href : src });
      else {
        await navigator.clipboard.writeText(src.startsWith('data:') ? '' : src);
        say('Link copied');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') say('Sharing is not available here');
    }
  };
  return (
    <div className="img">
      {failed ? (
        <small>Image failed to load. Check your connection and retry.</small>
      ) : (
        <img src={src} alt={cap || 'Generated image'} onError={() => setFailed(true)} />
      )}
      <div>
        <button onClick={() => saveUrl(src, 'nova-' + Date.now() + '.png')}>⬇ Download</button>
        <button onClick={share}>↗ Share</button>
        <button onClick={() => window.open(src, '_blank', 'noopener')}>Open</button>
        {cap && <small>{cap}</small>}
      </div>
    </div>
  );
}
