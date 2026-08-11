import {
  SYSTEM_INSTRUCTION,
  buildUserContent,
  RESPONSE_SCHEMA,
} from './metaPrompt.js'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

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
    return 'Gemini had a server error. Please try again in a few seconds.'
  return apiMsg || `Request failed with status ${status}.`
}

// Calls Gemini generateContent and returns the parsed optimizer result.
export async function optimizePrompt({ apiKey, model, style, rawPrompt }) {
  if (!apiKey) throw new Error('No API key set. Open the extension options to add your Gemini API key.')
  if (!rawPrompt || !rawPrompt.trim()) throw new Error('Please enter a prompt to optimize.')

  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: buildUserContent(rawPrompt, style) }] }],
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

// Lightweight key/connectivity check used by the options page.
export async function testApiKey({ apiKey, model }) {
  if (!apiKey) throw new Error('Enter an API key first.')
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
      generationConfig: { maxOutputTokens: 5 },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(friendlyError(res.status, data))
  return true
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
