import { useEffect, useState } from 'react'
import { MSG, DEFAULTS } from '../lib/constants.js'
import { getSettings, setSettings } from '../lib/storage.js'
import { sendToWorker } from '../lib/messaging.js'

// Known-good fallback models shown before/if the live model list can't be fetched.
// Use the option's own "Refresh" to pull the exact list your key is authorized for.
const FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
]

export default function Options() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULTS.model)
  const [models, setModels] = useState(FALLBACK_MODELS)
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState(null) // { type: 'ok'|'err'|'info', text }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setApiKey(s.apiKey)
      setModel(s.model)
      if (s.model && !FALLBACK_MODELS.includes(s.model)) {
        setModels((m) => [...new Set([s.model, ...m])])
      }
    })
  }, [])

  async function onSave() {
    await setSettings({ apiKey: apiKey.trim(), model })
    setStatus({ type: 'ok', text: 'Saved.' })
    setTimeout(() => setStatus(null), 2000)
  }

  async function onTest() {
    setBusy(true)
    setStatus({ type: 'info', text: 'Testing…' })
    try {
      await setSettings({ apiKey: apiKey.trim(), model })
      await sendToWorker({ type: MSG.TEST_KEY, apiKey: apiKey.trim(), model })
      setStatus({ type: 'ok', text: 'Success — your key works!' })
    } catch (err) {
      setStatus({ type: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function onRefreshModels() {
    setBusy(true)
    setStatus({ type: 'info', text: 'Fetching available models…' })
    try {
      const data = await sendToWorker({ type: MSG.LIST_MODELS, apiKey: apiKey.trim() })
      const list = data.models?.length ? data.models : FALLBACK_MODELS
      setModels(list)
      if (!list.includes(model)) setModel(list[0])
      setStatus({ type: 'ok', text: `Found ${list.length} models.` })
    } catch (err) {
      setStatus({ type: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap">
      <h1>Prompt Optimizer — Settings</h1>

      <section className="card">
        <label className="label" htmlFor="key">
          Gemini API key
        </label>
        <p className="help">
          Get a free key from{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>
          . It is stored only in this browser (chrome.storage.local) and is sent
          directly to Google — never to any other server.
        </p>
        <div className="key-row">
          <input
            id="key"
            className="input"
            type={showKey ? 'text' : 'password'}
            placeholder="AIza…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="ghost" onClick={() => setShowKey((v) => !v)} type="button">
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <label className="label" htmlFor="model" style={{ marginTop: 16 }}>
          Model
        </label>
        <div className="key-row">
          <select
            id="model"
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={onRefreshModels} disabled={busy} type="button">
            Refresh
          </button>
        </div>

        <div className="actions">
          <button className="primary" onClick={onSave} disabled={busy}>
            Save
          </button>
          <button className="secondary" onClick={onTest} disabled={busy}>
            Test key
          </button>
        </div>

        {status && <div className={`status ${status.type}`}>{status.text}</div>}
      </section>

      <p className="footnote">
        Your key never leaves your device except in direct requests to Google's
        Generative Language API.
      </p>
    </div>
  )
}
