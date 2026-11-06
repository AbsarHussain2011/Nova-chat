# NovaChat AI

Multi-provider AI chat (OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, custom) with
streaming replies, code preview, image generation, file/folder/image attachments and 10 chat styles.
React 19 app, installable PWA, works offline as an installed app.

## Local par chalana

```bash
node server.js          # http://localhost:3000   (Node 18+)
```

`dist/` mein built app pehle se maujood hai, isliye `npm install` ki zaroorat nahi.

## Code edit karna ho

```bash
npm install             # react + esbuild (sirf development ke liye)
npm run build:client    # src/ -> dist/ (hashed files + service worker)
node server.js
```

Source `src/` mein hai (`App.jsx`, `components/`, `lib/`). **Edit karne ke baad `npm run build:client` chalana zaroori hai**
aur naya `dist/` commit karna hai, warna Railway purana app serve karega.

## Railway par deploy

1. Is folder ko GitHub repo mein push karein (`dist/` ke saath).
2. Railway > **New Project** > **Deploy from GitHub repo** > repo chunein.
3. Service > **Settings > Networking > Generate Domain**.
4. Khul gaya. `railway.json` start command (`node server.js`) aur healthcheck (`/healthz`) set kar deta hai.

Optional variables (Service > Variables):

| Variable | Kaam |
| --- | --- |
| `ACCESS_TOKEN` | Set karein to server proxy aur chat sync ke liye token chahiye (public URL par recommended). App ki Settings mein wahi token daalein. |
| `DATA_DIR` | `chats.json` ka folder. Railway Volume attach karein to ye khud `RAILWAY_VOLUME_MOUNT_PATH` use karta hai. |

Volume ke bina server par saved chats redeploy par mit jaati hain. Chats waise bhi aapke device mein (IndexedDB) save rehti hain.

## Phone / PC par install (PWA)

- **Android (Chrome):** menu > *Install app*, ya app ke andar **Install app** button.
- **iPhone/iPad (Safari):** Share > **Add to Home Screen**.
- **Desktop (Chrome/Edge):** address bar mein install icon.

Install ke liye site HTTPS par honi chahiye (Railway domain par ye automatic hai) aur app ek baar online khuli honi chahiye.

### Deployment band hone par bhi chalna

Install ke waqt poori app (HTML, JS, CSS, icons) phone mein cache ho jaati hai, isliye server band ho to bhi app khulti hai aur purani
chats dikhti hain. Chat ke liye AI provider se seedha baat hoti hai, isliye:

- Settings mein **server proxy** aur **sync** band rakhein.
- Jo provider browser se CORS block karte hain (kuch providers karte hain) unke liye proxy chahiye hota hai, wo server band hone par nahi chalenge.
- Browser data / site data clear karne par cached app aur chats dono hat jaate hain.

## Icons

`public/icons/` ke icons `icon.png` ke logo se bane hain (favicon, 192, 512, maskable, Apple touch icon). Behtar quality ke liye higher-resolution
logo se `public/icons/*` aur `public/favicon.ico` badal dein, phir `npm run build:client`.
