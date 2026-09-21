// The meta-prompt: instructions that turn Gemini into an expert prompt engineer.
// This is the core IP of the product — it encodes the prompt-engineering principles
// we apply when rewriting a user's rough prompt.

const STYLE_GUIDANCE = {
  concise:
    'Prefer the shortest prompt that still contains every essential instruction. Avoid filler. Do not pad with examples unless they remove ambiguity.',
  balanced:
    'Aim for a clear, well-structured prompt of moderate length. Include structure and constraints, and add a brief example only when it genuinely reduces ambiguity.',
  detailed:
    'Produce a thorough, highly-structured prompt. Use clearly labeled sections, spell out edge cases, and include a short illustrative example or output template when helpful.',
}

export const SYSTEM_INSTRUCTION = `You are an expert prompt engineer. Your job is to rewrite a user's rough, underspecified prompt into a high-quality prompt that will make a large language model produce a markedly better result.

Apply these core prompt-engineering principles when they improve the prompt (do not force ones that do not fit):
1. ROLE — Give the model a clear, relevant persona or expertise ("You are a senior ...").
2. TASK — State the objective explicitly and unambiguously. Replace vague verbs with specific ones.
3. CONTEXT — Surface any implied context the model needs. If critical context is missing, add a clearly marked placeholder like [DESCRIBE X] instead of inventing facts.
4. FORMAT — Specify the desired output format, structure, and length (e.g. bullet list, JSON, sections, word count).
5. CONSTRAINTS — Add relevant constraints: tone, audience, things to include or avoid, level of detail.
6. REASONING — For complex or analytical tasks, ask the model to think step by step or show its reasoning before the final answer.
7. EXAMPLES — Add a brief few-shot example or output template only when it removes ambiguity. Never bloat the prompt.
8. CLARITY — Remove contradictions, redundancy, and ambiguity. Break a big request into ordered steps when useful.

HARD RULES:
- Preserve the user's original intent and subject matter. Never change what they are actually asking for.
- Do NOT answer or fulfill the user's prompt yourself. You only rewrite the prompt.
- Do NOT invent specific facts, names, numbers, or requirements the user did not imply. Use [PLACEHOLDERS] for genuinely missing information.
- Keep any concrete details the user already provided.
- Write the optimized prompt in the second person, addressed to the target LLM, ready to paste as-is.

Return ONLY a JSON object matching the provided schema. Do not wrap it in markdown fences or add commentary.`

// Builds the user-turn content sent to Gemini for a given raw prompt + style.
export function buildUserContent(rawPrompt, style) {
  const guidance = STYLE_GUIDANCE[style] || STYLE_GUIDANCE.balanced
  return `Optimization style: ${style}. ${guidance}

Rewrite the following prompt. Return the optimized prompt, a short list of the concrete changes you made (each phrased as "Added a role", "Specified output format", etc.), and the list of principle names you applied.

--- RAW PROMPT START ---
${rawPrompt}
--- RAW PROMPT END ---`
}

// Builds the user-turn content when visual or conversation context is available.
// context can include: { screenshotDataUrl (base64 data URL), conversationHistory ([string]) }
export function buildUserContentWithContext(rawPrompt, style, context = {}) {
  const guidance = STYLE_GUIDANCE[style] || STYLE_GUIDANCE.balanced
  const { screenshotDataUrl, conversationHistory } = context

  let contextBlocks = ''
  if (conversationHistory && conversationHistory.length > 0) {
    contextBlocks += `CONVERSATION HISTORY:\n${conversationHistory.join('\n')}\n\n`
  }
  if (screenshotDataUrl) {
    // Gemini multimodal: embed as a data URI in the parts array (handled in gemini.js)
    contextBlocks += 'SCREENSHOT: (see image input)\n\n'
  }

  return `Optimization style: ${style}. ${guidance}

You have additional context to help you understand the user's actual intent. Analyze it carefully — the user's raw prompt may be underspecified, vague, or written quickly. Your job is to infer what they really want and write a prompt that would let a capable LLM handle this specific situation.

${contextBlocks}--- RAW PROMPT START ---
${rawPrompt}
--- RAW PROMPT END ---`
}

// JSON schema Gemini must conform to (structured output).
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    optimized_prompt: {
      type: 'string',
      description: 'The improved prompt, ready to paste into an LLM.',
    },
    changes: {
      type: 'array',
      description: 'Concrete edits made, each a short human-readable sentence.',
      items: { type: 'string' },
    },
    techniques: {
      type: 'array',
      description: 'Names of the prompt-engineering principles applied.',
      items: { type: 'string' },
    },
  },
  required: ['optimized_prompt', 'changes', 'techniques'],
}
