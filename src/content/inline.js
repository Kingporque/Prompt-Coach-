// Inline mode: injects an "Optimize" button near the chat composer on supported
// sites (ChatGPT / Claude / Gemini) and rewrites the typed prompt in place.
//
// It reuses the same OPTIMIZE message path as the popup — the background service
// worker stays the only surface that holds the API key or talks to Gemini. The
// content script just reads the composer, asks the worker, and writes the result
// back. Style is intentionally not sent, so the worker uses the saved default.

import { MSG, STORAGE_KEYS, getInterventionSettings } from '../lib/constants.js'
import { sendToWorker } from '../lib/messaging.js'
import { resolveSite } from './sites.js'

const site = resolveSite()

// --- Text read / replace ---------------------------------------------------

function readText(editor) {
  if (editor.isContentEditable) return editor.innerText.trim()
  return (editor.value || '').trim()
}

// Replace the editor's whole contents with `text`. For contenteditable editors
// (all three current targets) we route through execCommand('insertText'), which
// keeps ProseMirror/Quill in sync and lands in the browser's native undo stack —
// so Ctrl+Z restores the user's original prompt. For a plain textarea/input we
// use the native value setter + input event so the site's framework state updates.
function replaceText(editor, text) {
  editor.focus()
  if (editor.isContentEditable) {
    const sel = window.getSelection()
    sel.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(editor)
    sel.addRange(range)
    document.execCommand('insertText', false, text)
    return
  }
  const proto =
    editor.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(editor, text)
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

// --- UI: button + toast ----------------------------------------------------

let toastTimer

function showToast(message, kind = 'info') {
  let toast = document.querySelector('.po-inline-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.className = 'po-inline-toast'
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.dataset.kind = kind
  toast.classList.add('po-inline-show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('po-inline-show'), 3000)
}

function setBusy(button, busy) {
  button.disabled = busy
  button.classList.toggle('po-inline-busy', busy)
  button.textContent = busy ? 'Optimizing…' : '✨ Optimize'
}

// --- Conversation scraping ---------------------------------------------------

// Reads the conversation history from the page DOM. Best-effort: if selectors
// don't match (site changed), returns an empty array so optimization still works.
// Returns structured turns: [{ type: 'user'|'assistant', text: string }]
function getConversationTurns() {
  if (!site.userMessageSelector || !site.assistantMessageSelector || !site.messageContentSelector) return []

  const userMsgs = document.querySelectorAll(site.userMessageSelector)
  const assistantMsgs = document.querySelectorAll(site.assistantMessageSelector)

  // Merge by document position so user and assistant turns interleave correctly.
  const merged = []
  userMsgs.forEach((el) => {
    const content = el.querySelector(site.messageContentSelector)?.textContent || el.textContent
    merged.push({ type: 'user', text: content.trim(), node: el })
  })
  assistantMsgs.forEach((el) => {
    const content = el.querySelector(site.messageContentSelector)?.textContent || el.textContent
    merged.push({ type: 'assistant', text: content.trim(), node: el })
  })

  merged.sort((a, b) => {
    const pos = a.node.compareDocumentPosition(b.node)
    if (pos & 4) return -1 // a before b
    if (pos & 2) return 1  // a after b
    return 0
  })

  // Clean up node references — we only need type + text.
  return merged.map((m) => ({ type: m.type, text: m.text.substring(0, 500) }))
}

// Serialize turns to the format expected by the Gemini meta-prompt.
function serializeTurns(turns) {
  return turns.map((m) => `${m.type === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n')
}

// Persist conversation history to chrome.storage.local (tagged per tab).
// Throttle to avoid excessive writes.
let persistTimer
function persistConversation() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    const turns = getConversationTurns()
    if (turns.length === 0) return
    // Get the tab ID from chrome.runtime
    const tabId = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: MSG.GET_TAB_ID }, (res) => resolve(res?.tabId))
    })
    if (tabId) {
      await sendToWorker({ type: MSG.UPDATE_CONVERSATION, tabId, history: { turns } })
    }
  }, 500)
}

// --- Screenshot capture -----------------------------------------------------

async function captureScreenshot() {
  try {
    const res = await sendToWorker({ type: MSG.CAPTURE_SCREENSHOT })
    if (!res?.dataUrl) throw new Error('No screenshot returned.')
    // Strip the data URL prefix, keep base64 for Gemini
    return res.dataUrl
  } catch (err) {
    showToast(err.message || 'Screenshot failed.', 'error')
    return null
  }
}

// --- Optimize handlers -------------------------------------------------------

async function onOptimize(editor, button) {
  const rawPrompt = readText(editor)
  if (!rawPrompt) {
    showToast('Nothing to optimize — type a prompt first.', 'info')
    return
  }
  setBusy(button, true)
  try {
    // On chat sites, auto-include conversation context if available.
    const message = { type: MSG.OPTIMIZE, rawPrompt }
    const turns = getConversationTurns()
    if (turns.length > 0) {
      message.type = MSG.OPTIMIZE_WITH_CONTEXT
      message.conversationHistory = [serializeTurns(turns)]
    }

    const data = await sendToWorker(message)
    if (data?.optimizedPrompt) {
      replaceText(editor, data.optimizedPrompt)
      showToast('Optimized ✓  Press Ctrl+Z to undo.', 'ok')
    } else {
      showToast('No optimized prompt came back. Try again.', 'error')
    }
  } catch (err) {
    showToast(err.message || 'Optimization failed.', 'error')
  } finally {
    setBusy(button, false)
  }
}

function makeButton(editor) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'po-inline-btn'
  button.textContent = '✨ Optimize'
  button.title = 'Rewrite this prompt with Prompt Optimizer'
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onOptimize(editor, button)
  })
  return button
}

// --- Injection lifecycle ---------------------------------------------------

// Keep a single button in sync with the current composer. These sites are SPAs
// whose composer mounts and re-mounts, so we re-point (or recreate) the button
// whenever the editor element changes, and never leave a stale one behind.
function inject() {
  const editor = document.querySelector(site.editorSelector)
  if (!editor) return
  const existing = document.querySelector('.po-inline-btn')
  if (existing && existing.__poEditor === editor) return
  if (existing) existing.remove()
  const button = makeButton(editor)
  button.__poEditor = editor
  document.body.appendChild(button)
}

// --- Phase 3: Proactive Intervention ------------------------------------------

// Load intervention settings directly from chrome.storage.local.
// Content scripts can access chrome.storage.local; no message round-trip needed.
async function loadInterventionSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.interventionSettings)
  return getInterventionSettings(stored[STORAGE_KEYS.interventionSettings])
}

// State for pattern detection
let settingsCache = null
let lastResponseTime = 0
let idleTimer = null
let sentMessages = []
let bannerEl = null

// Show the auto-suggest banner below the composer
function showBanner(onOptimize) {
  if (bannerEl) bannerEl.remove()
  const banner = document.createElement('div')
  banner.className = 'po-intervention-banner'
  banner.innerHTML = `
    <span class="po-intervention-msg">Looks like you're stuck. Try an optimized prompt?</span>
    <button class="po-intervention-optimize">✨ Optimize</button>
    <button class="po-intervention-dismiss">Dismiss</button>
  `
  const editor = document.querySelector(site.editorSelector)
  if (editor && editor.parentElement) {
    editor.parentElement.appendChild(banner)
  } else {
    document.body.appendChild(banner)
  }
  bannerEl = banner

  banner.querySelector('.po-intervention-optimize').addEventListener('click', () => {
    onOptimize()
    banner.remove()
    bannerEl = null
  })
  banner.querySelector('.po-intervention-dismiss').addEventListener('click', () => {
    banner.remove()
    bannerEl = null
  })
}

function bannerCallback() {
  const btn = document.querySelector('.po-inline-btn')
  const editor = document.querySelector(site.editorSelector)
  if (btn && editor) onOptimize(editor, btn)
}

// --- Pattern 1: Idle after assistant response ---
// When the assistant produces a response, start a timer. If the user doesn't
// type in the composer within idleThresholdMs, they may be stuck.
function onAssistantResponse() {
  lastResponseTime = Date.now()
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (!settingsCache || !settingsCache.enabled) return
    if (bannerEl) return
    const editor = document.querySelector(site.editorSelector)
    if (!editor) return
    const currentText = readText(editor)
    if (currentText) return
    showBanner(bannerCallback)
  }, settingsCache.idleThresholdMs)
}

// --- Pattern 2: Message editing (user editing a sent message repeatedly) ---
function onMessageEdit() {
  if (!settingsCache || !settingsCache.enabled) return
  if (bannerEl) return
  showBanner(bannerCallback)
}

// --- Pattern 3: Repetitive messages ---
function checkRepetition(newText) {
  if (!settingsCache || !settingsCache.enabled) return
  if (!newText) return

  sentMessages.push(newText)
  if (sentMessages.length > 10) sentMessages.shift()

  let similarCount = 0
  for (let i = sentMessages.length - 2; i >= 0; i--) {
    const prev = sentMessages[i]
    const maxLen = Math.max(newText.length, prev.length)
    if (maxLen === 0) continue
    const overlap = computeOverlap(newText, prev)
    if (overlap / maxLen > 0.7) similarCount++
  }

  if (similarCount >= settingsCache.repetitionThreshold) {
    if (bannerEl) return
    showBanner(bannerCallback)
  }
}

function computeOverlap(a, b) {
  const short = a.length < b.length ? a : b
  let matches = 0
  for (let i = 0; i < short.length; i++) {
    if (a[i] === b[i]) matches++
  }
  return matches
}

// --- Pattern 4: Error/refusal in DOM ---
const REFUSAL_PATTERNS = [
  /i (can't|cannot|am not able to)/i,
  /i'm sorry/i,
  /as an ai/i,
  /i don't have access/i,
  /i'm not sure/i,
  /unfortunately/i,
  /error/i,
  /unable to/i,
]

function checkForErrorsOrRefusals() {
  if (!site.assistantMessageSelector) return
  const msgs = document.querySelectorAll(site.assistantMessageSelector)
  msgs.forEach((el) => {
    if (el.dataset.poChecked) return
    const content = el.textContent || ''
    if (REFUSAL_PATTERNS.some((p) => p.test(content))) {
      el.dataset.poChecked = 'true'
      setTimeout(() => {
        if (bannerEl) return
        showBanner(bannerCallback)
      }, 2000)
    }
  })
}

// Watch for new assistant messages to trigger idle detection
function observeConversation() {
  if (!site.assistantMessageSelector) return
  checkForErrorsOrRefusals()

  const msgs = document.querySelectorAll(site.assistantMessageSelector)
  msgs.forEach((el) => {
    if (el.dataset.poWatched) return
    el.dataset.poWatched = 'true'
    onAssistantResponse()
  })
}

// Monitor user input in the composer for edits
function observeUserEdits() {
  let lastVal = ''
  const editor = document.querySelector(site.editorSelector)
  if (!editor) return
  function getText() {
    return readText(editor)
  }
  lastVal = getText()
  setInterval(() => {
    const cur = getText()
    if (cur !== lastVal && cur) {
      checkRepetition(cur)
      lastVal = cur
    }
  }, 500)
}

function startIntervention() {
  observeConversation()
  observeUserEdits()

  // Periodic check: idle timer + error scanning
  setInterval(() => {
    if (!settingsCache || !settingsCache.enabled) return
    if (bannerEl) return
    observeConversation()
  }, 5000)
}

function start() {
  inject()
  const observer = new MutationObserver(() => {
    inject()
    persistConversation()
    observeConversation()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

// Init: load settings then start
async function init() {
  settingsCache = await loadInterventionSettings()
  if (settingsCache.enabled) {
    startIntervention()
  }
}

if (site) {
  init()
  start()
}
