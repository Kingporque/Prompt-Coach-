// Per-site DOM adapters for inline mode.
//
// Selectors are the brittle part of inline mode, so they live here and nowhere
// else — a site changing its composer markup should be a one-line fix in this
// table. Each adapter describes how to find the chat composer on a given host.
//
//   editorSelector — the element the user types into. For the current three
//                    targets this is always a contenteditable rich editor.
//   mountSelector  — optional element to anchor the Optimize button inside. When
//                    absent (or not found at click time), inline.js falls back to
//                    a fixed-position button near the editor.

export const SITES = {
  'chatgpt.com': {
    name: 'ChatGPT',
    // ProseMirror contenteditable div.
    editorSelector: '#prompt-textarea',
  },
  'claude.ai': {
    name: 'Claude',
    editorSelector: 'div.ProseMirror[contenteditable="true"]',
  },
  'gemini.google.com': {
    name: 'Gemini',
    // Quill editor.
    editorSelector: '.ql-editor[contenteditable="true"]',
  },
}

// Resolve the adapter for a hostname, tolerating subdomains (e.g. www.claude.ai).
// Returns null when no adapter matches, in which case the content script no-ops.
export function resolveSite(hostname = location.hostname) {
  if (SITES[hostname]) return SITES[hostname]
  const host = Object.keys(SITES).find(
    (h) => hostname === h || hostname.endsWith(`.${h}`)
  )
  return host ? SITES[host] : null
}
