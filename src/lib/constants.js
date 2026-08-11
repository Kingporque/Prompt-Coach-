// Message types exchanged between UI (popup/options) and the background service worker.
export const MSG = {
  OPTIMIZE: 'OPTIMIZE_PROMPT',
  TEST_KEY: 'TEST_API_KEY',
  LIST_MODELS: 'LIST_MODELS',
}

// Default configuration. The model can be changed on the options page.
export const DEFAULTS = {
  model: 'gemini-3.5-flash',
  // Optimization "style" presets the user can switch between in the popup.
  style: 'balanced',
}

// Storage keys used in chrome.storage.local.
export const STORAGE_KEYS = {
  apiKey: 'geminiApiKey',
  model: 'model',
  style: 'style',
}
