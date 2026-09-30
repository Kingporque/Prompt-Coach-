import {
  SYSTEM_INSTRUCTION,
  buildUserContent,
  buildUserContentWithContext,
  RESPONSE_SCHEMA,
} from './metaPrompt.js'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504, 429])

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Retry wrapper for transient failures (5xx server errors, 429 rate limits).
// Uses exponential backoff. Returns the last response.
async function fetchWithRetry(url, opts, retries = 3) {
  let lastRes
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = 500 * Math.pow(2, attempt - 1)
      await sleep(delay)
    }
    lastRes = await fetch(url, opts)
    if (lastRes.ok || !RETRYABLE_STATUSES.has(lastRes.status)) return lastRes
  }
  return lastRes
}

// Turns a Gemini error response into a friendly, actionable message.
function friendlyError(status, body) {
  const apiMsg = body?.error?.message || ''
  if (status === 400 && /API key not valid/i.test(apiMsg))
    return 'Your Gemini API key is invalid. Open the extension options and paste a valid key.'
  if (status === 403)
    return 'Access denied (403). Check that your API key is correct and the Generative Language API is enabled.'
  if (status === 429)
    return 'Rate limit reached (429). Wait a moment and try again, or switch to a lighter model in options.'
  if (status === 404)
    return `Model not found (404). ${apiMsg} Try selecting a different model in options.`
  if (status >= 500)
    return 'Gemini had a server error. Please try again in a moment.'
  return apiMsg || `Request failed with status ${status}.`
}

function rankModel(model) {
  const id = model.toLowerCase()
  const stabilityRank = /preview|experimental/.test(id) ? 1 : 0
  const speedRank = id.includes('flash-lite') ? 0 : id.includes('flash') ? 1 : id.includes('pro') ? 2 : 3
  return [stabilityRank, speedRank]
}

async function probeModel({ apiKey, model }) {
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Return the required JSON with optimized_prompt set to "ok" and empty arrays for changes and techniques.' }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 128,
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(friendlyError(res.status, data))
    error.status = res.status
    throw error
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') || ''
  try {
    const parsed = JSON.parse(text)
    if (
      typeof parsed.optimized_prompt !== 'string' ||
      !Array.isArray(parsed.changes) ||
      !Array.isArray(parsed.techniques)
    ) throw new Error('The model did not return the required structured response.')
  } catch (error) {
    error.compatibilityFailure = true
    throw error
  }
}

// Tests the same structured-output capability used by prompt optimization.
export async function testApiKey({ apiKey, model }) {
  if (!apiKey) throw new Error('Enter an API key first.')
  if (!model) throw new Error('Choose a model first.')
  await probeModel({ apiKey, model })
  return true
}

// Finds a fast available model and verifies it can return the optimizer schema.
export async function connectGemini({ apiKey }) {
  if (!apiKey?.trim()) throw new Error('Paste your Gemini API key to continue.')

  const models = await listModels({ apiKey: apiKey.trim() })
  if (!models.length) {
    throw new Error('This key has no Gemini models available for text generation.')
  }

  const candidates = [...models]
    .sort((a, b) => {
      const [aStability, aSpeed] = rankModel(a)
      const [bStability, bSpeed] = rankModel(b)
      return aStability - bStability || aSpeed - bSpeed || b.localeCompare(a, undefined, { numeric: true })
    })
    .slice(0, 3)

  let lastCompatibilityError
  for (const model of candidates) {
    try {
      await probeModel({ apiKey: apiKey.trim(), model })
      return { model, models }
    } catch (error) {
      if (error.status === 400 || error.status === 404 || error.compatibilityFailure) {
        lastCompatibilityError = error
        continue
      }
      throw error
    }
  }

  const detail = lastCompatibilityError?.message
  throw new Error(
    `Your key works, but none of the available models passed the optimizer compatibility check.${detail ? ` ${detail}` : ''}`
  )
}

// Calls Gemini generateContent and returns the parsed optimizer result.
// context: { screenshotDataUrl, conversationHistory } — optional visual/conversation context
export async function optimizePrompt({ apiKey, model, style, rawPrompt, context = {} }) {
  if (!apiKey) throw new Error('No API key set. Open the extension options to add your Gemini API key.')
  if (!rawPrompt || !rawPrompt.trim()) throw new Error('Please enter a prompt to optimize.')

  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`

  const { screenshotDataUrl, conversationHistory } = context
  const useVision = Boolean(screenshotDataUrl)

  const userText = useVision || conversationHistory?.length
    ? buildUserContentWithContext(rawPrompt, style, context)
    : buildUserContent(rawPrompt, style)

  const userParts = [{ text: userText }]
  if (useVision) {
    // chrome.tabs.captureVisibleTab returns a data URL like "data:image/jpeg;base64,/9j/..."
    // Gemini's imageBytes field expects the base64 string without the prefix.
    const base64 = screenshotDataUrl.split(',')[1] || screenshotDataUrl
    userParts.push({ image: { imageBytes: base64 } })
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(friendlyError(res.status, data))

  // Guard against safety blocks or empty candidates.
  const candidate = data?.candidates?.[0]
  if (!candidate) {
    const blockReason = data?.promptFeedback?.blockReason
    throw new Error(
      blockReason
        ? `Gemini blocked the request (${blockReason}). Try rephrasing your prompt.`
        : 'Gemini returned no result. Please try again.'
    )
  }

  const text = candidate?.content?.parts?.map((p) => p.text).join('') || ''
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    // With responseSchema this should be valid JSON, but fall back gracefully.
    throw new Error('Could not parse the optimizer response. Please try again.')
  }

  return {
    optimizedPrompt: parsed.optimized_prompt || '',
    changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    techniques: Array.isArray(parsed.techniques) ? parsed.techniques : [],
  }
}

// Fetches the list of models available to this key (for the options dropdown).
export async function listModels({ apiKey }) {
  if (!apiKey) throw new Error('Enter an API key first.')
  const res = await fetch(`${API_BASE}/models`, {
    headers: { 'x-goog-api-key': apiKey },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(friendlyError(res.status, data))
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => id.startsWith('gemini-'))
}
