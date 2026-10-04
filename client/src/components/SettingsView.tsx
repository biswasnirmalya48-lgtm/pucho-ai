import { useState } from 'react'
import { Download, RotateCcw, Trash2 } from 'lucide-react'

import {
  deleteAllChats,
  dict,
  exportChats,
  refreshStatus,
  requestConfirm,
  setMode,
  updateSettings,
  usePucho,
} from '../lib/store'
import { api } from '../lib/api'
import { LANGUAGE_LABELS, STYLE_LABELS } from '../lib/i18n'
import type { ModeId } from '../lib/types'

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      className="switch"
      data-on={checked}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segment" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`segment__btn${option.value === value ? ' segment__btn--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function SettingsView() {
  const state = usePucho()
  const t = dict()
  const s = state.settings
  const status = state.status
  const [name, setName] = useState(s.name)
  const [models, setModels] = useState<{ id: string }[] | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  const loadModels = async () => {
    setModelError(null)
    try {
      const data = await api.models()
      setModels(data.models)
    } catch (err) {
      setModels([])
      setModelError(err instanceof Error ? err.message : 'Could not load models')
    }
  }

  return (
    <div className="view scroll">
      <div className="view__inner">
        <h1 className="view__title">{t.settingsTitle}</h1>
        <p className="view__sub">Personalise how PUCHO answers. Changes apply to new messages.</p>

        {/* ------------------------------ general ----------------------------- */}
        <section className="settings" aria-label={t.general}>
          <h2 className="section-title">{t.general}</h2>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.name}</div>
              <div className="row__hint">Used to greet you. Optional.</div>
            </div>
            <form
              style={{ display: 'flex', gap: 8 }}
              onSubmit={(event) => {
                event.preventDefault()
                void updateSettings({ name })
              }}
            >
              <input
                className="input"
                style={{ width: 180 }}
                value={name}
                placeholder="Optional"
                aria-label={t.name}
                onChange={(event) => setName(event.target.value)}
              />
              <button type="submit" className="btn btn--sm">
                {t.save}
              </button>
            </form>
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.theme}</div>
              <div className="row__hint">Dark, light, or follow your system.</div>
            </div>
            <Segment
              ariaLabel={t.theme}
              value={s.theme}
              onChange={(theme) => void updateSettings({ theme }, { silent: true })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
            />
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.language}</div>
              <div className="row__hint">PUCHO replies in this language when you use it.</div>
            </div>
            <select
              className="select"
              style={{ width: 180 }}
              value={s.language}
              aria-label={t.language}
              onChange={(event) =>
                void updateSettings({ language: event.target.value as typeof s.language }, { silent: true })
              }
            >
              {(Object.keys(LANGUAGE_LABELS) as (keyof typeof LANGUAGE_LABELS)[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.responseStyle}</div>
              <div className="row__hint">How much detail PUCHO gives by default.</div>
            </div>
            <Segment
              ariaLabel={t.responseStyle}
              value={s.responseStyle}
              onChange={(responseStyle) => void updateSettings({ responseStyle }, { silent: true })}
              options={(['simple', 'balanced', 'detailed'] as const).map((value) => ({
                value,
                label: STYLE_LABELS[value],
              }))}
            />
          </div>
        </section>

        {/* -------------------------------- AI -------------------------------- */}
        <section className="settings" aria-label={t.aiSection}>
          <h2 className="section-title">{t.aiSection}</h2>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.defaultMode}</div>
              <div className="row__hint">The mode new chats start in.</div>
            </div>
            <select
              className="select"
              style={{ width: 180 }}
              value={s.defaultMode}
              aria-label={t.defaultMode}
              onChange={(event) => {
                const mode = event.target.value as ModeId
                setMode(mode)
                void updateSettings({ defaultMode: mode }, { silent: true })
              }}
            >
              {(status?.modes ?? []).map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.icon} {mode.label}
                </option>
              ))}
            </select>
          </div>

          <div className="card">
            <h3 className="card__title">Model configuration</h3>
            <p className="card__desc">
              Modes are mapped to GROQ models on the server. You never need to know the model names —
              just pick a mode.
            </p>
            <div className="about-card" style={{ marginTop: 12 }}>
              {status?.modes.map((mode) => (
                <div className="about-card__row" key={mode.id}>
                  <span>
                    {mode.icon} {mode.label}
                  </span>
                  <span className="kv">{mode.model ?? 'not configured'}</span>
                </div>
              ))}
              <div className="about-card__row">
                <span>Vision model</span>
                <span className="kv">{status?.vision.model ?? 'none'}</span>
              </div>
              <div className="about-card__row">
                <span>API endpoint</span>
                <span className="kv">{status?.groq.apiUrl ?? '—'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--sm" onClick={() => void refreshStatus()}>
                <RotateCcw size={13} /> Refresh
              </button>
              <button type="button" className="btn btn--sm" onClick={() => void loadModels()}>
                List available models
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => void updateSettings({})}
              >
                {t.settingsSaved}
              </button>
            </div>

            {models && (
              <div style={{ marginTop: 12 }}>
                <p className="field__hint">
                  {models.length ? `${models.length} models available to this key:` : 'No models returned.'}
                </p>
                {modelError && <p className="field__hint" style={{ color: 'var(--danger)' }}>{modelError}</p>}
                <div className="quick-actions" style={{ marginTop: 8 }}>
                  {models.slice(0, 24).map((model) => (
                    <span className="quick-action" key={model.id}>
                      {model.id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------- chat ------------------------------- */}
        <section className="settings" aria-label={t.chatSection}>
          <h2 className="section-title">{t.chatSection}</h2>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.autoTitle}</div>
              <div className="row__hint">Name each conversation after your first question.</div>
            </div>
            <Switch
              label={t.autoTitle}
              checked={s.autoTitle}
              onChange={(autoTitle) => void updateSettings({ autoTitle }, { silent: true })}
            />
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.sendOnEnter}</div>
              <div className="row__hint">Off means Enter adds a new line and ⌘/Ctrl + Enter sends.</div>
            </div>
            <Switch
              label={t.sendOnEnter}
              checked={s.sendOnEnter}
              onChange={(sendOnEnter) => void updateSettings({ sendOnEnter }, { silent: true })}
            />
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.reducedMotion}</div>
              <div className="row__hint">Disable interface animations.</div>
            </div>
            <Switch
              label={t.reducedMotion}
              checked={s.reducedMotion}
              onChange={(reducedMotion) => void updateSettings({ reducedMotion }, { silent: true })}
            />
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">Conversation history</div>
              <div className="row__hint">
                {status?.counts.conversations ?? 0} conversations stored on this server.
              </div>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => void exportChats()}>
              <Download size={13} /> {t.exportChats}
            </button>
          </div>
        </section>

        {/* ------------------------------- voice ------------------------------ */}
        <section className="settings" aria-label={t.voiceSection}>
          <h2 className="section-title">{t.voiceSection}</h2>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.voiceInput}</div>
              <div className="row__hint">
                {'speechSynthesis' in window ? 'Browser speech recognition detected.' : 'Not supported by this browser.'}
              </div>
            </div>
            <Switch
              label={t.voiceInput}
              checked={s.voiceInput}
              onChange={(voiceInput) => void updateSettings({ voiceInput }, { silent: true })}
            />
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.readAloud}</div>
              <div className="row__hint">
                {status?.tts.available
                  ? 'Server speech is configured — PUCHO will use it.'
                  : 'Uses your browser’s built-in voice (no extra setup).'}
              </div>
            </div>
            <Switch
              label={t.readAloud}
              checked={s.readAloud}
              onChange={(readAloud) => void updateSettings({ readAloud }, { silent: true })}
            />
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">Speech rate</div>
              <div className="row__hint">Applies to read-aloud.</div>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.8}
              step={0.1}
              value={s.speakRate}
              style={{ width: 160 }}
              aria-label="Speech rate"
              onChange={(event) =>
                void updateSettings({ speakRate: Number(event.target.value) }, { silent: true })
              }
            />
          </div>
        </section>

        {/* -------------------------------- data ------------------------------ */}
        <section className="settings" aria-label={t.dataSection}>
          <h2 className="section-title">{t.dataSection}</h2>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.exportChats}</div>
              <div className="row__hint">Download every conversation as JSON.</div>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => void exportChats()}>
              <Download size={13} /> Export
            </button>
          </div>

          <div className="row">
            <div className="row__text">
              <div className="row__label">{t.deleteAllChats}</div>
              <div className="row__hint">Removes all conversations permanently. Projects and files stay.</div>
            </div>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() =>
                requestConfirm({
                  title: t.deleteAllChats,
                  message: 'Every conversation and message will be permanently deleted. This cannot be undone.',
                  confirmLabel: t.delete,
                  cancelLabel: t.cancel,
                  danger: true,
                  onConfirm: deleteAllChats,
                })
              }
            >
              <Trash2 size={13} /> {t.delete}
            </button>
          </div>
        </section>

        {/* ------------------------------- about ------------------------------ */}
        <section className="settings" aria-label={t.aboutSection}>
          <h2 className="section-title">{t.aboutSection}</h2>
          <div className="about-card">
            <div className="about-card__row">
              <span>{t.version}</span>
              <span className="kv">{status?.app.version ?? '1.0.0'}</span>
            </div>
            <div className="about-card__row">
              <span>{t.poweredBy}</span>
              <span className="kv">GROQ</span>
            </div>
            <div className="about-card__row">
              <span>Web research</span>
              <span className="kv">
                {status?.webSearch.available ? (status.webSearch.provider ?? 'enabled') : 'not configured'}
              </span>
            </div>
            <div className="about-card__row">
              <span>Image understanding</span>
              <span className="kv">{status?.vision.available ? status.vision.model : 'text only'}</span>
            </div>
          </div>
          <p className="field__hint" style={{ marginTop: 10 }}>
            PUCHO answers with AI and can be wrong. Check anything important.
          </p>
        </section>
      </div>
    </div>
  )
}