import { useEffect, useState } from 'react'
import { MSG, DEFAULTS, STORAGE_KEYS, INTERVENTION_DEFAULTS } from '../lib/constants.js'
import { getSettings, setSettings } from '../lib/storage.js'
import { sendToWorker } from '../lib/messaging.js'

// Kept for the advanced selector before the user refreshes their available models.
const FALLBACK_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]

export default function Options() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULTS.model)
  const [models, setModels] = useState(FALLBACK_MODELS)
  const [showKey, setShowKey] = useState(false)
  const [connected, setConnected] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [status, setStatus] = useState(null) // { type: 'ok'|'err'|'info', text }
  const [busy, setBusy] = useState(false)

  const [interventionEnabled, setInterventionEnabled] = useState(INTERVENTION_DEFAULTS.enabled)
  const [autoApply, setAutoApply] = useState(INTERVENTION_DEFAULTS.autoApply)
  const [idleThreshold, setIdleThreshold] = useState(INTERVENTION_DEFAULTS.idleThresholdMs)
  const [repetitionThreshold, setRepetitionThreshold] = useState(INTERVENTION_DEFAULTS.repetitionThreshold)

  useEffect(() => {
    getSettings().then((s) => {
      setApiKey(s.apiKey)
      setModel(s.model)
      setConnected(Boolean(s.apiKey && s.model))
      if (s.model) setModels((m) => [...new Set([s.model, ...m])])
    })

    chrome.storage.local.get(STORAGE_KEYS.interventionSettings).then((stored) => {
      const s = stored[STORAGE_KEYS.interventionSettings]
      if (s) {
        setInterventionEnabled(s.enabled ?? INTERVENTION_DEFAULTS.enabled)
        setAutoApply(s.autoApply ?? INTERVENTION_DEFAULTS.autoApply)
        setIdleThreshold(s.idleThresholdMs ?? INTERVENTION_DEFAULTS.idleThresholdMs)
        setRepetitionThreshold(s.repetitionThreshold ?? INTERVENTION_DEFAULTS.repetitionThreshold)
      }
    })
  }, [])

  async function onSavePreferences() {
    await chrome.storage.local.set({
      [STORAGE_KEYS.interventionSettings]: {
        enabled: interventionEnabled,
        autoApply,
        idleThresholdMs: Number(idleThreshold),
        repetitionThreshold: Number(repetitionThreshold),
      },
    })
    setStatus({ type: 'ok', text: 'Preferences saved.' })
    setTimeout(() => setStatus(null), 2000)
  }

  async function onConnect() {
    if (!apiKey.trim()) {
      setStatus({ type: 'err', text: 'Paste your Gemini API key first.' })
      return
    }
    setBusy(true)
    setStatus({ type: 'info', text: 'Checking your key and finding a compatible model…' })
    try {
      const result = await sendToWorker({ type: MSG.CONNECT_GEMINI, apiKey: apiKey.trim() })
      await setSettings({ apiKey: apiKey.trim(), model: result.model })
      setModel(result.model)
      setModels(result.models)
      setConnected(true)
      setStatus({ type: 'ok', text: `Connected. ${result.model} passed the optimizer compatibility check.` })
    } catch (err) {
      setConnected(false)
      setStatus({ type: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function onTestModel() {
    setBusy(true)
    setStatus({ type: 'info', text: `Checking ${model} with the optimizer response format…` })
    try {
      await sendToWorker({ type: MSG.TEST_KEY, apiKey: apiKey.trim(), model })
      await setSettings({ apiKey: apiKey.trim(), model })
      setConnected(true)
      setStatus({ type: 'ok', text: `${model} works with the optimizer. Settings saved.` })
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
      if (!list.includes(model)) {
        setModel(list[0])
        setConnected(false)
      }
      setStatus({ type: 'ok', text: `Found ${list.length} available models. Select one and run its compatibility test.` })
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
        <h2>Connect Gemini</h2>
        <p className="help">
          Create a key in{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>
          , paste it here, and we’ll check it and choose a compatible model for you.
        </p>
        <div className="key-row">
          <input
            id="key"
            className="input"
            aria-label="Gemini API key"
            type={showKey ? 'text' : 'password'}
            placeholder="AIza…"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setConnected(false)
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="ghost" onClick={() => setShowKey((value) => !value)} type="button">
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="actions">
          <button className="primary connect-button" onClick={onConnect} disabled={busy}>
            {busy ? 'Connecting…' : connected ? 'Reconnect and check model' : 'Connect and choose model'}
          </button>
        </div>

        {connected && (
          <div className="connection-state">
            <span className="connection-indicator" />
            Connected model: <strong>{model}</strong>
          </div>
        )}
        {status && <div className={`status ${status.type}`} role="status" aria-live="polite">{status.text}</div>}

        <button
          className="advanced-toggle"
          type="button"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {advancedOpen ? 'Hide advanced model settings' : 'Advanced model settings'}
        </button>

        {advancedOpen && (
          <div className="advanced-settings">
            <label className="label" htmlFor="model">Choose a different model</label>
            <div className="key-row">
              <select
                id="model"
                className="input"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  setConnected(false)
                }}
              >
                {[...new Set([...models, model])].map((availableModel) => (
                  <option key={availableModel} value={availableModel}>{availableModel}</option>
                ))}
              </select>
              <button className="ghost" onClick={onRefreshModels} disabled={busy} type="button">
                Refresh
              </button>
            </div>
            <div className="actions">
              <button className="secondary" onClick={onTestModel} disabled={busy} type="button">
                {busy ? 'Checking…' : 'Test and save model'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <label className="label" htmlFor="intervention-enabled">
          Proactive Intervention
        </label>
        <p className="help">
          Prompt Coach watches your chat and offers an optimized rewrite when it
          detects friction — idle time after a response, message edits, repetitive
          prompts, or model refusals/errors.
        </p>

        <div className="field-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={interventionEnabled}
              onChange={(e) => setInterventionEnabled(e.target.checked)}
            />
            <span>Enable auto-suggest</span>
          </label>
        </div>

        <div className="field-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              disabled={!interventionEnabled}
            />
            <span>Auto-apply suggestions (bypass confirmation)</span>
          </label>
        </div>

        <label className="label" htmlFor="idle-threshold" style={{ marginTop: 16 }}>
          Idle threshold
        </label>
        <p className="help">
          After an assistant response, how long (ms) to wait before the composer
          being empty counts as "stuck." Default: 15 seconds.
        </p>
        <input
          id="idle-threshold"
          className="input"
          type="number"
          min="5000"
          max="120000"
          step="1000"
          value={idleThreshold}
          onChange={(e) => setIdleThreshold(Number(e.target.value))}
          disabled={!interventionEnabled}
        />

        <label className="label" htmlFor="repetition-threshold" style={{ marginTop: 16 }}>
          Repetition threshold
        </label>
        <p className="help">
          How many near-duplicate messages to tolerate before flagging repetition.
          Default: 2.
        </p>
        <input
          id="repetition-threshold"
          className="input"
          type="number"
          min="2"
          max="5"
          step="1"
          value={repetitionThreshold}
          onChange={(e) => setRepetitionThreshold(Number(e.target.value))}
          disabled={!interventionEnabled}
        />

        <div className="actions">
          <button className="secondary" onClick={onSavePreferences} type="button">
            Save preferences
          </button>
        </div>
      </section>

      <p className="footnote">
        Your key never leaves your device except in direct requests to Google's
        Generative Language API.
      </p>
    </div>
  )
}
