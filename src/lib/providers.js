export const PROVIDERS = {
  openai: { n: 'OpenAI', u: 'https://api.openai.com/v1', m: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'] },
  anthropic: {
    n: 'Anthropic',
    u: 'https://api.anthropic.com/v1',
    m: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
  },
  gemini: {
    n: 'Google Gemini',
    u: 'https://generativelanguage.googleapis.com/v1beta',
    m: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  openrouter: {
    n: 'OpenRouter',
    u: 'https://openrouter.ai/api/v1',
    m: ['openai/gpt-4o-mini', 'google/gemini-2.5-flash'],
  },
  groq: { n: 'Groq', u: 'https://api.groq.com/openai/v1', m: ['llama-3.3-70b-versatile'] },
  deepseek: { n: 'DeepSeek', u: 'https://api.deepseek.com/v1', m: ['deepseek-chat', 'deepseek-reasoner'] },
  mistral: { n: 'Mistral', u: 'https://api.mistral.ai/v1', m: ['mistral-large-latest'] },
  xai: { n: 'xAI', u: 'https://api.x.ai/v1', m: ['grok-4'] },
  custom: { n: 'Custom (OpenAI-compatible)', u: '', m: [] },
  pollinations: { n: 'Pollinations (free images)', u: '', m: [] },
};

export const CHAT_PROVIDERS = Object.keys(PROVIDERS).filter((k) => k !== 'pollinations');
export const IMAGE_PROVIDERS = ['pollinations', 'openai', 'gemini', 'openrouter', 'custom'];

export const PERSONAS = {
  eng: [
    '👨‍💻 Senior Engineer',
    'You are an expert senior software engineer. Write clean, production-grade code. Put every file in its own fenced code block with a language tag. For UI demos return one self-contained HTML file so it can be previewed. Be concise.',
  ],
  chat: ['💬 Assistant', "You are a helpful, friendly assistant. Reply in the user's language."],
  urdu: ['🇵🇰 Roman Urdu buddy', 'Reply in Roman Urdu unless asked otherwise. Be clear and friendly.'],
  writer: ['✍️ Writer', 'You are a skilled writer and editor.'],
};

export const defCfg = {
  prov: 'openai',
  model: 'gpt-4o-mini',
  keys: {},
  urls: {},
  imgProv: 'pollinations',
  imgModel: '',
  persona: 'eng',
  skin: 'classic',
  proxy: false,
  sync: false,
  token: '',
  theme: 'dark',
};

export const baseUrl = (cfg, p) => (cfg.urls[p] || PROVIDERS[p].u).replace(/\/$/, '');
