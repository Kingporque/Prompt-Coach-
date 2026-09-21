import { STORAGE_KEYS, DEFAULTS, conversationKey } from './constants.js'

// Thin promise wrappers around chrome.storage.local so UI code can await settings.

export async function getSettings() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.model,
    STORAGE_KEYS.style,
  ])
  return {
    apiKey: stored[STORAGE_KEYS.apiKey] || '',
    model: stored[STORAGE_KEYS.model] || DEFAULTS.model,
    style: stored[STORAGE_KEYS.style] || DEFAULTS.style,
  }
}

export async function setSettings(partial) {
  const mapped = {}
  if ('apiKey' in partial) mapped[STORAGE_KEYS.apiKey] = partial.apiKey
  if ('model' in partial) mapped[STORAGE_KEYS.model] = partial.model
  if ('style' in partial) mapped[STORAGE_KEYS.style] = partial.style
  await chrome.storage.local.set(mapped)
}

// Conversation history helpers (tagged per tab).
export async function getConversation(tabId) {
  const key = conversationKey(tabId)
  const stored = await chrome.storage.local.get(key)
  return stored[key] || { turns: [], lastUpdated: 0 }
}

export async function setConversation(tabId, history) {
  const key = conversationKey(tabId)
  await chrome.storage.local.set({ [key]: { ...history, lastUpdated: Date.now() } })
}

export async function clearConversation(tabId) {
  await chrome.storage.local.remove(conversationKey(tabId))
}
