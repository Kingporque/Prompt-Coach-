// Message types exchanged between UI (popup/options) and the background service worker.
export const MSG = {
  OPTIMIZE: 'OPTIMIZE_PROMPT',
  OPTIMIZE_WITH_CONTEXT: 'OPTIMIZE_WITH_CONTEXT',
  TEST_KEY: 'TEST_API_KEY',
  LIST_MODELS: 'LIST_MODELS',
  CAPTURE_SCREENSHOT: 'CAPTURE_SCREENSHOT',
  GET_CONVERSATION: 'GET_CONVERSATION',
  UPDATE_CONVERSATION: 'UPDATE_CONVERSATION',
  GET_TAB_ID: 'GET_TAB_ID',
}

// Models that support vision input (image understanding).
export const VISION_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

// Whether a model supports vision based on its name.
export function supportsVision(model) {
  return VISION_MODELS.some((v) => model === v || model.startsWith(v.replace(/-\d+$/, '')))
}

// Default configuration. The model can be changed on the options page.
export const DEFAULTS = {
  model: 'gemini-2.5-flash',
  // Optimization "style" presets the user can switch between in the popup.
  style: 'balanced',
}

// Storage keys used in chrome.storage.local.
export const STORAGE_KEYS = {
  apiKey: 'geminiApiKey',
  model: 'model',
  style: 'style',
  conversation: 'conversationHistory',
  interventionSettings: 'interventionSettings',
}

// Phase 3 defaults.
export const INTERVENTION_DEFAULTS = {
  enabled: true,          // auto-suggest on frustration signals
  autoApply: false,       // auto-inject without user confirmation
  idleThresholdMs: 15000, // ms of inactivity after assistant response before suggesting
  repetitionThreshold: 2, // number of similar messages before flagging
}

// Max turns to retain in persisted conversation history.
export const MAX_HISTORY_TURNS = 10

// Prefix for per-tab conversation storage keys.
export function conversationKey(tabId) {
  return `${STORAGE_KEYS.conversation}_${tabId}`
}

export function getInterventionSettings(stored) {
  return { ...INTERVENTION_DEFAULTS, ...(stored || {}) }
}
