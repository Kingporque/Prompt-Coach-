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

### Install a prebuilt ZIP

1. Download and extract `prompt-optimizer-v*.zip` from the GitHub release.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json` at its top level.

To use the optional setup script instead, download the installer for your OS:

- [Download for Windows (PowerShell)](https://github.com/Kingporque/Prompt-Coach-/raw/refs/heads/main/scripts/install.ps1?download=1)
- [Download for Linux/macOS (shell)](https://github.com/Kingporque/Prompt-Coach-/raw/refs/heads/main/scripts/install.sh?download=1)

The installers are separate downloads from the repository, not files inside the
extension ZIP. These links work after the scripts are pushed to `main`. Run the
downloaded script from your Downloads folder. It offers a choice to download the
latest extension ZIP or use an existing ZIP/folder. The download-latest choice
requires a published GitHub release with `prompt-optimizer.zip` attached. For
example, run `sh ~/Downloads/install.sh` on Linux/macOS, or
`powershell -ExecutionPolicy Bypass -File "$HOME\Downloads\install.ps1"` on
Windows. Chrome still requires the manual **Load unpacked** step for extensions
installed outside the Web Store. The API key is not handled by the installer
scripts.

### Build from source

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

To load a source build into Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the **`dist/`** folder

### Connect Gemini

1. Open the extension's **Options** page.
2. Choose **Create a key** to open <https://aistudio.google.com/app/apikey>.
3. Create a Gemini API key, return to Options, and paste it.
4. Choose **Connect and choose model**. The extension checks the key, finds
      available Gemini models, and tests up to three candidates using the same
      structured response format as optimization. It saves the first compatible
      model it finds.
5. If you prefer another model, open **Advanced model settings**, select it, and
      choose **Test and save model**.

Google may apply usage limits or charges to API usage. The compatibility check
uses a small generation request and may count toward the account's quota.

You're ready — click the extension icon, paste a rough prompt, and hit **Optimize**.

---

## Performance

The intervention content script uses minimal CPU via these techniques:

- **Single `requestAnimationFrame` loop** — one `tick()` function replaces three
  separate `setInterval` calls (500ms, 5s, plus message-edit polling). The loop
  only runs when intervention is enabled and stops automatically otherwise.
- **Combined DOM pass** — `observeConversation()` scans assistant messages once
  per tick for both refusal/error patterns and new-message detection, instead of
  two separate `querySelectorAll` calls.
- **Editor reference caching** — the composer element is queried once at startup
  and reused, avoiding repeated DOM lookups on every poll.
- **MutationObserver trigger** — DOM mutations (new assistant replies, chat
  updates) trigger `observeConversation()` immediately, so the idle timer starts
  without waiting for the next rAF cycle.

This keeps pattern detection reactive (detects changes within ~16ms) while
consuming negligible CPU when the page is idle.

## Releases

To create a new release (version bump + tagged commit + ZIP archive):

```bash
npm run release       # patch bump (0.1.1 → 0.1.2)
npm run release minor # minor bump (0.1.1 → 0.2.0)
npm run release major # major bump (0.1.1 → 1.0.0)
```

This script:
1. Builds the extension
2. Bumps the version in `package.json`
3. Commits + tags + pushes to Git
4. Creates versioned and stable-name ZIP archives of the `dist/` folder and prepares two separate OS-specific installers
5. Prints a link to the GitHub "New Release" page and asks you to upload all four assets

## Distribution

| Method | Reach | Notes |
|--------|-------|-------|
| **Chrome Web Store** | Millions | Best for broad distribution. Requires a one-time $5 developer registration. |
| **GitHub Releases** | Early users | Upload both ZIPs and both OS-specific installer scripts from `npm run release`. Users still complete Chrome's one-time **Load unpacked** step. |
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
- [x] Guided Gemini connection: validate key, discover models, and auto-select a compatible model
- [x] **Proactive intervention** (Phase 3) — pattern detection + auto-suggest banner
      (idle after response, message edits, repetition, model errors/refusals)
- [x] **Performance optimization** — single rAF-driven poll + combined DOM pass keeps
      pattern detection lightweight and reactive (no fixed-interval CPU burn)
- [x] **Setup & release automation** — `npm run setup` + `npm run release` scripts

---

## Privacy

The extension requests `storage` (to save your key + settings), `contextMenus`
(the right-click item), and `activeTab` + `scripting` (to read your selection and
write the result back only on the tab where you click the menu — no standing access
to any site). Network access is limited to `https://generativelanguage.googleapis.com/`.
Your API key and prompts are sent directly to Google and to nowhere else.