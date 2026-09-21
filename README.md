# Prompt Optimizer

A Chrome extension (Manifest V3) that takes your rough, underspecified prompt and
rewrites it using core prompt-engineering principles — role, explicit task,
context, output format, constraints, reasoning, and examples — so the LLM you're
using produces a much better result.

It runs entirely on **your own free Gemini API key**. Your key is stored locally
in the browser and is sent only to Google's Generative Language API — never to any
other server.

---

## How it works

```
Your rough prompt ──▶ Popup UI ─────┐
                                     ├──▶ Service worker ──▶ Gemini API
On-page chat box ──▶ Inline button ─┘        │
                                             ▼
                   Optimized prompt + list of what changed + techniques applied
```

- **Popup (React)** — paste a prompt, pick a style (Concise / Balanced / Detailed), click Optimize.
- **Inline mode** — a content script adds an Optimize button on ChatGPT / Claude / Gemini and rewrites the chat box in place (`src/content/`).
- **Service worker** — the only place that holds the API key and talks to the network.
- **Meta-prompt** — turns Gemini into an "expert prompt engineer" and asks for structured JSON back (`src/lib/metaPrompt.js`).

---

## Setup

### Quick start (from a fresh clone)

```bash
git clone <repo>
cd Prompt-Coach-
npm install
npm run setup   # creates .env template and prints next steps
npm run build   # builds to /dist
```

> If `npm install` reports that esbuild's install script was blocked, run
> `npm install-scripts approve esbuild` then `npm install` again (already handled
> in this repo via `allowScripts` in `package.json`).

### Load it into Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the **`dist/`** folder

### Add your Gemini API key

1. Get a free key at <https://aistudio.google.com/app/apikey>
2. Right-click the extension icon → **Options** (or click the ⚙︎ in the popup)
3. Paste your key, click **Test key**, then **Save**
4. Optionally click **Refresh** to pull the live list of models your key can use

You're ready — click the extension icon, paste a rough prompt, and hit **Optimize**.

---

## Development

```bash
npm run dev     # Vite dev server with HMR for the popup/options
npm run build   # Production build into dist/
```

## Releases

To create a new release (version bump + tagged commit + ZIP archive):

```bash
npm run release       # patch bump (0.1.0 → 0.1.1)
npm run release minor # minor bump (0.1.0 → 0.2.0)
npm run release major # major bump (0.1.0 → 1.0.0)
```

This script:
1. Builds the extension
2. Bumps the version in `package.json`
3. Commits + tags + pushes to Git
4. Creates a `prompt-optimizer-v*.zip` of the `dist/` folder
5. Prints a link to the GitHub "New Release" page for uploading the ZIP

## Distribution

| Method | Reach | Notes |
|--------|-------|-------|
| **Chrome Web Store** | Millions | Best for broad distribution. Requires a one-time $5 developer registration. |
| **GitHub Releases** | Dev users | Upload the ZIP from `npm run release`. Users download → extract → "Load unpacked" in `chrome://extensions`. |
| **Direct download link** | Anyone with the link | Host the ZIP on your site or a CDN. Same load-unpacked flow. |

For live-reloading inside Chrome, `npm run dev` works with `@crxjs/vite-plugin`;
Chrome loads `dist/` while HMR updates the UI. Re-run `npm run build` before
loading the final unpacked extension.

---

## Project structure

```
.
├── manifest.json              MV3 manifest (permissions, commands, content scripts)
├── vite.config.js             Vite + React + @crxjs build config
├── package.json               Scripts + dependencies
├── package-lock.json
├── .gitignore
├── README.md
├── icons/                     Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background/
    │   └── service-worker.js    Message router + right-click menu; only network/key surface
    ├── lib/
    │   ├── constants.js         Message types, defaults, storage keys
    │   ├── storage.js           Promise wrappers over chrome.storage.local
    │   ├── metaPrompt.js        Prompt-engineer system prompt + JSON schema  ← core IP
    │   ├── gemini.js            Gemini generateContent client + friendly errors
    │   └── messaging.js         UI ↔ worker message helper
    ├── content/
    │   ├── inline.js            Injects the Optimize button; reads/rewrites the composer
    │   ├── sites.js             Per-site composer selectors  ← edit here if a site changes
    │   └── inline.css           Styles for the injected button + toast
    ├── popup/                   React popup (paste → optimize → copy)
    │   ├── Popup.jsx
    │   ├── main.jsx
    │   ├── index.html
    │   └── popup.css
    └── options/                 API key + model settings
        ├── Options.jsx
        ├── main.jsx
        ├── index.html
        └── options.css
```

> `dist/` (build output) and `node_modules/` are generated and git-ignored.

---

## Roadmap

- [x] Popup: paste → optimize → copy, with "what changed" breakdown
- [x] Options: bring-your-own Gemini key, model picker, key test
- [x] **Inline mode** — a content script that adds an "Optimize" button next to the
      chat box on ChatGPT / Claude / Gemini web and rewrites the text in place
      (replace-in-place with native Ctrl+Z undo; uses your saved style)
- [x] **Right-click Optimize** — select text on *any* page → right-click →
      "Optimize prompt"; replaces it in place if editable, else copies the result
- [x] **Keyboard shortcut** — `Ctrl+Shift+Y` (`⌘+Shift+Y` on Mac) opens the popup;
      remap at `chrome://extensions/shortcuts`
- [ ] Prompt history / recent optimizations
- [ ] Guided first-run onboarding for the API key
- [x] **Proactive intervention** (Phase 3) — pattern detection + auto-suggest banner
      (idle after response, message edits, repetition, model errors/refusals)
- [x] **Setup & release automation** — `npm run setup` + `npm run release` scripts

---

## Privacy

The extension requests `storage` (to save your key + settings), `contextMenus`
(the right-click item), and `activeTab` + `scripting` (to read your selection and
write the result back only on the tab where you click the menu — no standing access
to any site). Network access is limited to `https://generativelanguage.googleapis.com/`.
Your API key and prompts are sent directly to Google and to nowhere else.