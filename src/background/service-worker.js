import { MSG } from '../lib/constants.js'
import { getSettings, getConversation, setConversation } from '../lib/storage.js'
import { optimizePrompt, testApiKey, listModels } from '../lib/gemini.js'

// The service worker is the only place that touches the network / API key.
// UI surfaces (popup, options, and later a content script) message it and get
// a { ok, data } / { ok: false, error } envelope back.

async function handle(message, _sender) {
  const settings = await getSettings()

  switch (message?.type) {
    case MSG.OPTIMIZE: {
      const data = await optimizePrompt({
        apiKey: settings.apiKey,
        model: message.model || settings.model,
        style: message.style || settings.style,
        rawPrompt: message.rawPrompt,
      })
      return data
    }
    case MSG.OPTIMIZE_WITH_CONTEXT: {
      const data = await optimizePrompt({
        apiKey: settings.apiKey,
        model: message.model || settings.model,
        style: message.style || settings.style,
        rawPrompt: message.rawPrompt,
        context: {
          screenshotDataUrl: message.screenshotDataUrl,
          conversationHistory: message.conversationHistory,
        },
      })
      return data
    }
    case MSG.CAPTURE_SCREENSHOT: {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.windowId) throw new Error('No active tab to capture.')
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: 0.85,
      })
      return { dataUrl }
    }
    case MSG.GET_CONVERSATION: {
      const tabId = message.tabId
      if (!tabId) throw new Error('No tab ID provided.')
      return getConversation(tabId)
    }
    case MSG.UPDATE_CONVERSATION: {
      const tabId = message.tabId
      if (!tabId) throw new Error('No tab ID provided.')
      await setConversation(tabId, message.history)
      return { ok: true }
    }
    case MSG.TEST_KEY: {
      await testApiKey({
        apiKey: message.apiKey ?? settings.apiKey,
        model: message.model || settings.model,
      })
      return { ok: true }
    }
    case MSG.LIST_MODELS: {
      const models = await listModels({ apiKey: message.apiKey ?? settings.apiKey })
      return { models }
    }
    case MSG.GET_TAB_ID: {
      return { tabId: _sender?.tab?.id }
    }
    default:
      throw new Error(`Unknown message type: ${message?.type}`)
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message, _sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }))
  // Return true to keep the message channel open for the async response.
  return true
})

// --- Right-click "Optimize" -------------------------------------------------
// A selection context menu that works on ANY page (not just the three chat
// sites). It reuses the same optimizePrompt() path as the popup/inline button.
// It needs no broad host permissions: we only touch the page via scripting +
// activeTab, granted transiently when the user clicks the menu item.

const CONTEXT_MENU_ID = 'po-optimize-selection'
const CONTEXT_MENU_ID_WITH_SCREENSHOT = 'po-optimize-selection-screenshot'

// Menu items live in non-persistent storage, so (re)create on install and on
// every service-worker startup to be safe. removeAll first avoids duplicates.
function createMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Optimize prompt with Prompt Optimizer',
      contexts: ['selection'],
    })
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID_WITH_SCREENSHOT,
      title: 'Optimize prompt + screenshot with Prompt Optimizer',
      contexts: ['selection'],
    })
  })
}

chrome.runtime.onInstalled.addListener(createMenu)
chrome.runtime.onStartup.addListener(createMenu)

// Runs IN THE PAGE (via chrome.scripting). Self-contained — no imports, no
// closure over worker scope. Replaces the current selection in place when it's
// inside an editable field (native Ctrl+Z undo), otherwise copies the optimized
// text to the clipboard. Either way it shows a brief toast.
function applyInPage(text) {
  const el = document.activeElement
  const isEditable =
    el &&
    (el.isContentEditable ||
      el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && /^(text|search|url|email|tel)$/i.test(el.type)))

  const toast = (msg, bg) => {
    const t = document.createElement('div')
    t.textContent = msg
    t.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:320px;' +
      'padding:10px 14px;border-radius:10px;color:#fff;background:' + bg + ';' +
      "font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      'box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .16s ease'
    document.body.appendChild(t)
    requestAnimationFrame(() => (t.style.opacity = '1'))
    setTimeout(() => {
      t.style.opacity = '0'
      setTimeout(() => t.remove(), 300)
    }, 3500)
  }

  // 1) Replace in place when the selection sits in an editable field.
  if (isEditable) {
    el.focus()
    if (document.execCommand('insertText', false, text)) {
      toast('Optimized ✓  Press Ctrl+Z to undo.', '#065f46')
      return
    }
  }

  // 2) Otherwise copy to the clipboard. The optimize call is async, so the user
  //    gesture is usually spent by now — the async Clipboard API often rejects.
  //    Fall back to a synchronous execCommand('copy'), which is more permissive.
  const legacyCopy = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }

  // 3) Last resort: drop a selectable, pre-highlighted box so the optimized text
  //    is never lost even when every clipboard path is blocked.
  const manualBox = () => {
    const box = document.createElement('textarea')
    box.readOnly = true
    box.value = text
    box.style.cssText =
      'position:fixed;bottom:70px;right:24px;z-index:2147483647;width:320px;height:120px;' +
      'padding:10px;border-radius:10px;border:1px solid #991b1b;background:#1f2937;color:#fff;' +
      "font:500 12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      'box-shadow:0 6px 20px rgba(0,0,0,.25)'
    document.body.appendChild(box)
    box.focus()
    box.select()
    toast('Copy was blocked — select the text in the box and copy it.', '#991b1b')
    setTimeout(() => box.remove(), 15000)
  }

  const settle = (copied) => {
    if (copied) return toast('Optimized ✓  Copied to clipboard.', '#065f46')
    if (legacyCopy()) return toast('Optimized ✓  Copied to clipboard.', '#065f46')
    manualBox()
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => settle(true), () => settle(false))
  } else {
    settle(false)
  }
}

// Same idea for surfacing an error to the user without a popup surface.
function toastInPage(message) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText =
    'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:320px;' +
    'padding:10px 14px;border-radius:10px;background:#991b1b;color:#fff;' +
    "font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    'box-shadow:0 6px 20px rgba(0,0,0,.25)'
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3500)
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || ![CONTEXT_MENU_ID, CONTEXT_MENU_ID_WITH_SCREENSHOT].includes(info.menuItemId)) return
  const raw = (info.selectionText || '').trim()
  const withScreenshot = info.menuItemId === CONTEXT_MENU_ID_WITH_SCREENSHOT

  const run = (func, arg) =>
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args: [arg] })

  try {
    const settings = await getSettings()
    let context = {}

    if (withScreenshot) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (activeTab?.windowId) {
        context.screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
          format: 'jpeg',
          quality: 0.85,
        })
      }
    }

    const result = await optimizePrompt({
      apiKey: settings.apiKey,
      model: settings.model,
      style: settings.style,
      rawPrompt: raw,
      context,
    })
    await run(applyInPage, result.optimizedPrompt)
  } catch (err) {
    await run(toastInPage, err?.message || 'Optimization failed.')
  }
})
