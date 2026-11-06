import { useEffect, useRef, useState } from 'react';
import { readFile, say } from '../lib/util.js';

export default function Composer({ onSend, onStop, busy }) {
  const [text, setText] = useState('');
  const [imageMode, setImageMode] = useState(false);
  const [files, setFiles] = useState([]);
  const [imgs, setImgs] = useState([]);
  const area = useRef(null);
  const fileIn = useRef(null);
  const dirIn = useRef(null);

  useEffect(() => {
    const onFill = (e) => {
      setText(e.detail);
      area.current?.focus();
    };
    window.addEventListener('fill', onFill);
    return () => window.removeEventListener('fill', onFill);
  }, []);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [text]);

  async function addFiles(list) {
    for (const f of [...list].slice(0, 60)) {
      const name = f.webkitRelativePath || f.name;
      if (/node_modules|\.git\//.test(name)) continue;
      try {
        if (f.type.startsWith('image/')) {
          if (f.size > 8e6) say(name + ' is too large (max 8 MB)');
          else {
            const url = await readFile(f, 'readAsDataURL');
            setImgs((a) => [...a, url]);
          }
        } else if (f.size > 250000) say(name + ' is too large (max 250 KB)');
        else {
          const content = await readFile(f, 'readAsText');
          if (content.includes('\0')) say(name + ' is binary, skipped');
          else setFiles((a) => [...a, { name, text: content }]);
        }
      } catch {
        say('Could not read ' + name);
      }
    }
  }

  const pick = (e) => {
    const list = [...e.target.files];
    e.target.value = '';
    addFiles(list);
  };

  const onPaste = (e) => {
    const pics = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (pics.length) {
      e.preventDefault();
      addFiles(pics);
    }
  };

  const ready = imgs;
  const go = () => {
    if (busy || (!text.trim() && !files.length && !ready.length)) return;
    onSend(text.trim(), { imgs: ready, files }, imageMode);
    setText('');
    setFiles([]);
    setImgs([]);
  };

  return (
    <div className="comp">
      <div className="tools">
        <button className="chip tool" onClick={() => fileIn.current?.click()}>📎 Files / images</button>
        <button className="chip tool" onClick={() => dirIn.current?.click()}>📁 Folder</button>
        <button className={'tg' + (imageMode ? ' on' : '')} aria-pressed={imageMode} onClick={() => setImageMode(!imageMode)}>🎨 Image mode</button>
        <input ref={fileIn} hidden multiple type="file" onChange={pick} />
        <input ref={dirIn} hidden multiple type="file" webkitdirectory="" onChange={pick} />
      </div>
      {(files.length > 0 || imgs.length > 0) && (
        <div className="attached">
          {files.map((f, i) => (
            <span key={'f' + i} className="chip">📄 {f.name}
              <button onClick={() => setFiles((a) => a.filter((_, j) => j !== i))} aria-label={'Remove ' + f.name}>✕</button>
            </span>
          ))}
          {imgs.map((_, i) => (
            <span key={'i' + i} className="chip">🖼 image
              <button onClick={() => setImgs((a) => a.filter((_, j) => j !== i))} aria-label="Remove image">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <textarea
          ref={area}
          rows={1}
          aria-label="Message"
          value={text}
          placeholder={imageMode ? 'Describe the image you want…' : 'Message NovaChat…'}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.innerWidth > 800) {
              e.preventDefault();
              go();
            }
          }}
        />
        {busy ? (
          <button className="stop" onClick={onStop} aria-label="Stop generating">■ Stop</button>
        ) : (
          <button className="pri send" onClick={go}>Send</button>
        )}
      </div>
    </div>
  );
}
