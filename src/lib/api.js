import { PROVIDERS, baseUrl } from './providers.js';
import { b64Of, mimeOf } from './util.js';

/* ---------- request plumbing ---------- */
export const authHeaders = (cfg, p) => {
  const k = cfg.keys[p];
  if (p === 'anthropic')
    return {
      'x-api-key': k,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  if (p === 'gemini') return { 'x-goog-api-key': k };
  return k ? { authorization: 'Bearer ' + k } : {};
};

export const serverHeaders = (cfg) => ({
  'content-type': 'application/json',
  ...(cfg.token ? { 'x-nova-token': cfg.token } : {}),
});

function friendly(err, cfg) {
  if (err.name === 'AbortError') return err;
  if (!navigator.onLine) return new Error('You are offline. Reconnect and try again.');
  if (err instanceof TypeError)
    return new Error(
      cfg.proxy
        ? 'Could not reach the NovaChat server. If the deployment is stopped, turn off "backend proxy" in Settings.'
        : 'Network error. The provider may block browser requests (CORS) — try enabling the backend proxy in Settings.'
    );
  return err;
}

async function errorFrom(res) {
  const text = await res.text().catch(() => '');
  let msg = '';
  try {
    const j = JSON.parse(text);
    msg =
      j.error?.message ||
      (typeof j.error === 'string' ? j.error : '') ||
      j.message ||
      j[0]?.error?.message ||
      '';
  } catch {
    msg = text.slice(0, 200);
  }
  return new Error(msg || 'HTTP ' + res.status);
}

async function send(cfg, url, method, headers, body, signal) {
  const h = { 'content-type': 'application/json', ...headers };
  const b = body === undefined ? undefined : JSON.stringify(body);
  try {
    const res = cfg.proxy
      ? await fetch('/api/proxy', {
          method: 'POST',
          headers: serverHeaders(cfg),
          body: JSON.stringify({ url, method, headers: h, body: b }),
          signal,
        })
      : await fetch(url, { method, headers: h, body: b, signal });
    if (!res.ok) throw await errorFrom(res);
    return res;
  } catch (e) {
    throw friendly(e, cfg);
  }
}

export async function httpJson(cfg, url, method, headers, body, signal) {
  const res = await send(cfg, url, method, headers, body, signal);
  return res.json().catch(() => ({}));
}

/* ---------- message shaping ---------- */
const fileText = (m) =>
  (m.text || '') + (m.files || []).map((f) => `\n\n--- ${f.name} ---\n${f.text}`).join('');

// Drop failed/generated messages and merge consecutive turns from the same role,
// which every provider accepts and which keeps retries after errors valid.
function history(msgs) {
  const out = [];
  for (const m of msgs) {
    if (m.gen || m.err || m.streaming) continue;
    const text = fileText(m);
    const imgs = m.imgs || [];
    if (!text.trim() && !imgs.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.text = [last.text, text].filter(Boolean).join('\n\n');
      last.imgs = [...last.imgs, ...imgs];
    } else out.push({ role: m.role, text, imgs });
  }
  return out;
}

const toAnthropic = (h) =>
  h.map((m) => ({
    role: m.role,
    content: [
      ...m.imgs.map((u) => ({ type: 'image', source: { type: 'base64', media_type: mimeOf(u), data: b64Of(u) } })),
      ...(m.text.trim() ? [{ type: 'text', text: m.text }] : []),
    ],
  }));

const toGemini = (h) =>
  h.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [
      ...(m.text.trim() ? [{ text: m.text }] : []),
      ...m.imgs.map((u) => ({ inlineData: { mimeType: mimeOf(u), data: b64Of(u) } })),
    ],
  }));

const toOpenAI = (h, sys) => [
  { role: 'system', content: sys },
  ...h.map((m) => ({
    role: m.role,
    content: m.imgs.length
      ? [
          ...(m.text.trim() ? [{ type: 'text', text: m.text }] : []),
          ...m.imgs.map((u) => ({ type: 'image_url', image_url: { url: u } })),
        ]
      : m.text,
  })),
];

/* ---------- streaming chat ---------- */
async function readSSE(res, onData) {
  const decoder = new TextDecoder();
  let buf = '';
  const flush = (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) !== -1) {
      const block = buf.slice(0, i);
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) onData(data);
    }
  };
  if (!res.body) return flush((await res.text()) + '\n\n');
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    flush(decoder.decode(value, { stream: true }));
  }
  flush(decoder.decode() + '\n\n');
}

export async function askStream(cfg, msgs, system, onDelta, signal) {
  const p = cfg.prov;
  const b = baseUrl(cfg, p);
  if (!cfg.keys[p] && p !== 'custom') throw new Error(`Open Settings and add your ${PROVIDERS[p].n} API key.`);
  if (p === 'custom' && !cfg.urls.custom) throw new Error('Open Settings and set the Base URL for your custom provider.');
  if (!cfg.model) throw new Error('Choose a model in Settings.');
  const h = history(msgs);
  if (!h.length) throw new Error('Nothing to send.');

  let url, body, pick;
  if (p === 'anthropic') {
    url = b + '/messages';
    body = { model: cfg.model, max_tokens: 4096, system, messages: toAnthropic(h), stream: true };
    pick = (j) => {
      if (j.type === 'error') throw new Error(j.error?.message || 'Stream error');
      return j.type === 'content_block_delta' && j.delta?.type === 'text_delta' ? j.delta.text : '';
    };
  } else if (p === 'gemini') {
    url = `${b}/models/${cfg.model}:streamGenerateContent?alt=sse`;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: toGemini(h) };
    pick = (j) => {
      if (j.error) throw new Error(j.error.message || 'Stream error');
      return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    };
  } else {
    url = b + '/chat/completions';
    body = { model: cfg.model, messages: toOpenAI(h, system), stream: true };
    pick = (j) => {
      if (j.error) throw new Error(j.error.message || 'Stream error');
      return j.choices?.[0]?.delta?.content || '';
    };
  }

  const res = await send(cfg, url, 'POST', authHeaders(cfg, p), body, signal);
  let full = '';
  try {
    await readSSE(res, (data) => {
      if (data === '[DONE]') return;
      let j;
      try {
        j = JSON.parse(data);
      } catch {
        return;
      }
      const d = pick(j);
      if (d) {
        full += d;
        onDelta(full);
      }
    });
  } catch (e) {
    throw friendly(e, cfg);
  }
  if (!full.trim()) throw new Error('The model returned an empty reply.');
  return full;
}

/* ---------- images ---------- */
export async function genImage(cfg, prompt, signal) {
  const p = cfg.imgProv;
  const b = baseUrl(cfg, p);
  if (p === 'pollinations')
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Date.now() % 99999}`;
  if (!cfg.keys[p] && p !== 'custom') throw new Error(`Add your ${PROVIDERS[p].n} API key in Settings (Image section).`);
  if (p === 'gemini') {
    const j = await httpJson(
      cfg,
      `${b}/models/${cfg.imgModel || 'gemini-2.5-flash-image'}:generateContent`,
      'POST',
      authHeaders(cfg, p),
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } },
      signal
    );
    const part = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData || x.inline_data);
    const d = part?.inlineData || part?.inline_data;
    if (!d) throw new Error('The model did not return an image. Try a different prompt or image model.');
    return `data:${d.mimeType || d.mime_type};base64,${d.data}`;
  }
  const j = await httpJson(
    cfg,
    b + '/images/generations',
    'POST',
    authHeaders(cfg, p),
    { model: cfg.imgModel || 'gpt-image-1', prompt, n: 1 },
    signal
  );
  const d = j.data?.[0];
  if (!d) throw new Error('The provider did not return an image.');
  return d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url;
}

export async function listModels(cfg) {
  const j = await httpJson(cfg, baseUrl(cfg, cfg.prov) + '/models', 'GET', authHeaders(cfg, cfg.prov));
  return (j.data || j.models || []).map((x) => (x.id || x.name).replace('models/', ''));
}
