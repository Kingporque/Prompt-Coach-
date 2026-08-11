// Inline mode: injects an "Optimize" button near the chat composer on supported
// sites (ChatGPT / Claude / Gemini) and rewrites the typed prompt in place.
//
// It reuses the same OPTIMIZE message path as the popup — the background service
// worker stays the only surface that holds the API key or talks to Gemini. The
// content script just reads the composer, asks the worker, and writes the result
// back. Style is intentionally not sent, so the worker uses the saved default.

import { MSG } from '../lib/constants.js'
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

async function onOptimize(editor, button) {
  const rawPrompt = readText(editor)
  if (!rawPrompt) {
    showToast('Nothing to optimize — type a prompt first.', 'info')
    return
  }
  setBusy(button, true)
  try {
    const data = await sendToWorker({ type: MSG.OPTIMIZE, rawPrompt })
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

function start() {
  inject()
  const observer = new MutationObserver(() => inject())
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

if (site) start()
