import { STORAGE_KEYS, DEFAULTS } from './constants.js'

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
