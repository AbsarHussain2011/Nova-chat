import { useRef, useState } from 'react';
import { CHAT_PROVIDERS, IMAGE_PROVIDERS, PERSONAS, PROVIDERS, baseUrl } from '../lib/providers.js';
import { listModels } from '../lib/api.js';
import { resetApp } from '../lib/pwa.js';
import { isIOS, isStandalone, say } from '../lib/util.js';

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export default function Settings({ cfg, setCfg, close, install, onExport, onImport, onClearChats }) {
  const p = cfg.prov;
  const ip = cfg.imgProv;
  const [models, setModels] = useState(PROVIDERS[p].m);
  const importIn = useRef(null);
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const sub = (k, key, v) => setCfg((c) => ({ ...c, [k]: { ...c[k], [key]: v } }));

  async function fetchModels() {
    try {
      const list = await listModels(cfg);
      setModels(list);
      say(list.length ? `${list.length} models loaded` : 'No models returned');
    } catch (e) {
      say(e.message);
    }
  }

  return (
    <div className="modal" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h3>Settings <button onClick={close}>Done</button></h3>

        <div className="g2">
          <label>Chat provider
            <select value={p} onChange={(e) => {
              const v = e.target.value;
              set('prov', v);
              set('model', PROVIDERS[v].m[0] || '');
              setModels(PROVIDERS[v].m);
            }}>
              {CHAT_PROVIDERS.map((k) => <option key={k} value={k}>{PROVIDERS[k].n}</option>)}
            </select>
          </label>
          <label>Model
            <input list="models" value={cfg.model} onChange={(e) => set('model', e.target.value)} />
            <datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
        </div>

        <label>API key (stored only on this device)
          <input type="password" autoComplete="off" value={cfg.keys[p] || ''} onChange={(e) => sub('keys', p, e.target.value)} placeholder="sk-…" />
        </label>
        <label>Base URL {p === 'custom' ? '(required)' : '(optional override)'}
          <input value={cfg.urls[p] || ''} onChange={(e) => sub('urls', p, e.target.value)} placeholder={PROVIDERS[p].u || 'https://your-host/v1'} />
        </label>
        <button onClick={fetchModels}>↻ Fetch available models</button>

        <div className="g2">
          <label>Image provider
            <select value={ip} onChange={(e) => set('imgProv', e.target.value)}>
              {IMAGE_PROVIDERS.map((k) => <option key={k} value={k}>{PROVIDERS[k].n}</option>)}
            </select>
          </label>
          <label>Image model
            <input value={cfg.imgModel} onChange={(e) => set('imgModel', e.target.value)} placeholder="gpt-image-1" />
          </label>
        </div>
        {ip !== 'pollinations' && (
          <label>Image API key
            <input type="password" autoComplete="off" value={cfg.keys[ip] || ''} onChange={(e) => sub('keys', ip, e.target.value)} />
          </label>
        )}

        <div className="g2">
          <label>Persona
            <select value={cfg.persona} onChange={(e) => set('persona', e.target.value)}>
              {Object.entries(PERSONAS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
            </select>
          </label>
          <label>Theme
            <select value={cfg.theme} onChange={(e) => set('theme', e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Match device</option>
            </select>
          </label>
        </div>

        <fieldset>
          <legend>Server features (need the NovaChat server to be running)</legend>
          <label className="chk">
            <input type="checkbox" checked={cfg.proxy} onChange={(e) => set('proxy', e.target.checked)} />
            Send requests through the server proxy (fixes CORS errors)
          </label>
          <label className="chk">
            <input type="checkbox" checked={cfg.sync} onChange={(e) => set('sync', e.target.checked)} />
            Sync chats to the server
          </label>
          {(cfg.proxy || cfg.sync) && (
            <label>Server access token (only if ACCESS_TOKEN is set on the server)
              <input type="password" autoComplete="off" value={cfg.token} onChange={(e) => set('token', e.target.value)} />
            </label>
          )}
          <small className="mu">With both off, NovaChat talks to your AI provider directly and keeps working as an installed app even when the server is stopped.</small>
        </fieldset>

        <fieldset>
          <legend>Your data</legend>
          <div className="g2">
            <button onClick={onExport}>⬇ Export chats</button>
            <button onClick={() => importIn.current?.click()}>⬆ Import chats</button>
          </div>
          <input ref={importIn} hidden type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onImport(f); }} />
          <button className="danger" onClick={onClearChats}>Delete all chats</button>
        </fieldset>

        {install && <button className="pri" onClick={install}>⬇ Install NovaChat</button>}
        {!install && isIOS() && !isStandalone() && (
          <small className="mu">To install on iPhone/iPad: tap Share, then “Add to Home Screen”.</small>
        )}

        <div className="foot">
          <span>NovaChat {VERSION}</span>
          <button onClick={resetApp}>Reset app files</button>
        </div>
      </div>
    </div>
  );
}
