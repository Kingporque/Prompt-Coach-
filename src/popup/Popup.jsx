import { useEffect, useState } from 'react'
import { MSG, DEFAULTS } from '../lib/constants.js'
import { getSettings, setSettings } from '../lib/storage.js'
import { sendToWorker } from '../lib/messaging.js'

const STYLES = [
  { id: 'concise', label: 'Concise' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'detailed', label: 'Detailed' },
]

export default function Popup() {
  const [raw, setRaw] = useState('')
  const [style, setStyle] = useState(DEFAULTS.style)
  const [hasKey, setHasKey] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  // Load persisted settings + last-used style on mount.
  useEffect(() => {
    getSettings().then((s) => {
      setHasKey(Boolean(s.apiKey))
      setStyle(s.style || DEFAULTS.style)
    })
  }, [])

  function onStyleChange(next) {
    setStyle(next)
    setSettings({ style: next })
  }

  async function onOptimize() {
    setError('')
    setResult(null)
    setCopied(false)
    if (!raw.trim()) {
      setError('Enter a prompt first.')
      return
    }
    setLoading(true)
    try {
      const data = await sendToWorker({ type: MSG.OPTIMIZE, rawPrompt: raw, style })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function onCopy() {
    if (!result?.optimizedPrompt) return
    await navigator.clipboard.writeText(result.optimizedPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function onKeyDown(e) {
    // Ctrl/Cmd + Enter to optimize.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onOptimize()
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Prompt Optimizer</h1>
        <button
          className="link"
          onClick={() => chrome.runtime.openOptionsPage()}
          title="Settings"
        >
          ⚙︎
        </button>
      </header>

      {!hasKey && (
        <div className="banner">
          No Gemini API key set.{' '}
          <button className="link inline" onClick={() => chrome.runtime.openOptionsPage()}>
            Add one in settings →
          </button>
        </div>
      )}

      <label className="field-label" htmlFor="raw">
        Your rough prompt
      </label>
      <textarea
        id="raw"
        className="textarea"
        placeholder="e.g. write me a blog post about coffee"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={onKeyDown}
        rows={5}
      />

      <div className="controls">
        <div className="segmented">
          {STYLES.map((s) => (
            <button
              key={s.id}
              className={`seg ${style === s.id ? 'active' : ''}`}
              onClick={() => onStyleChange(s.id)}
              type="button"
            >
              {s.label}
            </button>
          ))}
        </div>
        <button className="primary" onClick={onOptimize} disabled={loading}>
          {loading ? 'Optimizing…' : 'Optimize'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <section className="result">
          <div className="result-head">
            <span className="field-label">Optimized prompt</span>
            <button className="copy" onClick={onCopy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <div className="output">{result.optimizedPrompt}</div>

          {result.changes?.length > 0 && (
            <details className="changes" open>
              <summary>What changed ({result.changes.length})</summary>
              <ul>
                {result.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </details>
          )}

          {result.techniques?.length > 0 && (
            <div className="tags">
              {result.techniques.map((t, i) => (
                <span key={i} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="hint">Tip: press Ctrl/⌘ + Enter to optimize.</footer>
    </div>
  )
}
