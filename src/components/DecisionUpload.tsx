import { useRef, useState, useCallback, useEffect } from 'react'
import type { PlanType } from '../lib/userService'
import type { DocumentType } from '../types'
import { useTranslation } from '../hooks/useTranslation'
import { useLanguage } from '../contexts/LanguageContext'

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Arabic',
  'Portuguese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Turkish', 'Italian', 'Korean',
]

const PAGE_LIMITS: Record<PlanType, number> = {
  free: 20,
  starter: 50,
  pro: 100,
  business: 999999,
  custom: 999999,
}

const MAX_FILES = 10
const ACCEPT = '.pdf,.txt,application/pdf,text/plain'

const DOCUMENT_TYPES: { value: DocumentType; labelKey: string; descKey: string; icon: string }[] = [
  { value: 'auto', labelKey: 'decision.docTypeAutoLabel', descKey: 'decision.docTypeAutoDesc', icon: '🔍' },
  { value: 'cv', labelKey: 'decision.docTypeCvLabel', descKey: 'decision.docTypeCvDesc', icon: '👤' },
  { value: 'supplier_quotation', labelKey: 'decision.docTypeSupplierLabel', descKey: 'decision.docTypeSupplierDesc', icon: '📦' },
  { value: 'contract', labelKey: 'decision.docTypeContractLabel', descKey: 'decision.docTypeContractDesc', icon: '📋' },
  { value: 'business_proposal', labelKey: 'decision.docTypeProposalLabel', descKey: 'decision.docTypeProposalDesc', icon: '📊' },
]

interface Props {
  onDecisionSubmit: (files: File[], decisionGoal: string, language: string, documentType: DocumentType) => void
  isLoading: boolean
  error: string | null
  plan?: PlanType
  planLimit?: number
  monthlyUsage?: number
  remaining?: number
  isLoggedIn?: boolean
  onOpenAuth?: () => void
  isAtLimit?: boolean
  hideHero?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

export default function DecisionUpload({
  onDecisionSubmit,
  isLoading,
  error,
  plan = 'free',
  planLimit = 2,
  monthlyUsage = 0,
  remaining = 2,
  isLoggedIn = false,
  onOpenAuth,
  isAtLimit = false,
  hideHero = false,
}: Props) {
  const { t } = useTranslation()
  const { lang: uiLang } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [decisionGoal, setDecisionGoal] = useState('')
  // Default the analysis language to the site's UI language, so a Chinese
  // reader gets a Chinese report without having to change this separately.
  const [language, setLanguage] = useState(() => LANGUAGES.includes(uiLang) ? uiLang : 'English')
  const [dragOver, setDragOver] = useState(false)
  const [documentType, setDocumentType] = useState<DocumentType>('auto')

  const pageLimit = PAGE_LIMITS[plan]
  const usagePct = planLimit > 0 ? Math.min(100, Math.round((monthlyUsage / planLimit) * 100)) : 100

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return
    const next = [...files]
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) break
      // Deduplicate by name+size
      if (!next.find(x => x.name === f.name && x.size === f.size)) next.push(f)
    }
    setFiles(next)
  }, [files])

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  // Guests must sign in first; remember their intent so analysis runs
  // automatically right after they authenticate (no second click needed).
  const [pendingSubmit, setPendingSubmit] = useState(false)

  function runAnalysis() {
    if (files.length === 0 || decisionGoal.trim().length < 5) return
    onDecisionSubmit(files, decisionGoal.trim(), language, documentType)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoggedIn) { setPendingSubmit(true); onOpenAuth?.(); return }
    runAnalysis()
  }

  // When a guest signs in after pressing the button, auto-start their analysis.
  useEffect(() => {
    if (isLoggedIn && pendingSubmit && !isLoading && !isAtLimit) {
      setPendingSubmit(false)
      runAnalysis()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, pendingSubmit, isLoading, isAtLimit])

  const canSubmit =
    !isLoading && !isAtLimit && files.length > 0 && decisionGoal.trim().length >= 5

  const goalExamples = t('decision.goalExamples')

  return (
    <div className="decision-upload">
      {/* ── Hero headline (hidden when embedded inside landing page) ── */}
      {!hideHero && (
        <div className="du-hero">
          <div className="du-hero-badges">
            <span className="du-badge">{t('decision.badge1')}</span>
          </div>
          <p className="du-headline-pre">{t('decision.headlinePre')}</p>
          <h1 className="du-headline">{t('decision.headlineMain')}</h1>
          <p className="du-subheadline">{t('decision.subheadline')}</p>
        </div>
      )}

      <form className="du-form" onSubmit={handleSubmit}>
        {/* ── Step 1: Upload Documents ── */}
        <div className="du-step">
          <div className="du-step-header">
            <span className="du-step-num">1</span>
            <div>
              <p className="du-step-title">{t('decision.step1Title')}</p>
              <p className="du-step-sub">{t('decision.step1Sub').replace('{max}', String(MAX_FILES)).replace('{pageLimit}', pageLimit >= 999999 ? '∞' : String(pageLimit))}</p>
            </div>
          </div>

          {/* Dropzone */}
          <div
            className={`du-dropzone${dragOver ? ' du-dropzone--over' : ''}${files.length > 0 ? ' du-dropzone--has-files' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
          >
            {files.length === 0 ? (
              <div className="du-dropzone-empty">
                <span className="du-upload-icon"><UploadIcon /></span>
                <p className="du-drop-title">{t('decision.dropTitle')}</p>
                <p className="du-drop-hint">{t('decision.dropHint')}</p>
              </div>
            ) : (
              <div className="du-file-list">
                {files.map((f, i) => (
                  <div key={i} className="du-file-chip">
                    <span className="du-file-icon"><FileIcon /></span>
                    <span className="du-file-name">{f.name}</span>
                    <span className="du-file-size">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      className="du-file-remove"
                      onClick={ev => { ev.stopPropagation(); removeFile(i) }}
                      aria-label={`Remove ${f.name}`}
                    >✕</button>
                  </div>
                ))}
                {files.length < MAX_FILES && (
                  <div className="du-add-more">
                    <span>+ {t('decision.addMore')}</span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="du-hidden-input"
              onChange={e => addFiles(e.target.files)}
            />
          </div>
        </div>

        {/* ── Step 2: Document Type ── */}
        <div className="du-step">
          <div className="du-step-header">
            <span className="du-step-num">2</span>
            <div>
              <p className="du-step-title">{t('decision.selectFramework')}</p>
              <p className="du-step-sub">{t('decision.selectFrameworkSub')}</p>
            </div>
          </div>
          <div className="du-doctype-grid">
            {DOCUMENT_TYPES.map(dt => (
              <button
                key={dt.value}
                type="button"
                className={`du-doctype-btn${documentType === dt.value ? ' du-doctype-btn--active' : ''}`}
                onClick={() => setDocumentType(dt.value)}
              >
                <span className="du-doctype-icon">{dt.icon}</span>
                <span className="du-doctype-label">{t(dt.labelKey)}</span>
                <span className="du-doctype-desc">{t(dt.descKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Step 3: Decision Goal ── */}
        <div className="du-step">
          <div className="du-step-header">
            <span className="du-step-num">3</span>
            <div>
              <p className="du-step-title">{t('decision.step2Title')}</p>
              <p className="du-step-sub">{t('decision.step2Sub')}</p>
            </div>
          </div>
          <textarea
            className="du-goal-input"
            value={decisionGoal}
            onChange={e => setDecisionGoal(e.target.value)}
            placeholder={goalExamples}
            rows={2}
            maxLength={500}
          />
          <span className="du-goal-count">{decisionGoal.length}/500</span>
        </div>

        {/* ── Language + Submit ── */}
        <div className="du-submit-row">
          <select
            className="lang-switcher du-lang"
            value={language}
            onChange={e => setLanguage(e.target.value)}
          >
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <button
            type="submit"
            className="btn-primary btn-cta save-cta du-submit-btn"
            disabled={!canSubmit}
          >
            {isLoading
              ? t('decision.analyzing')
              : !isLoggedIn
                ? `🔒 ${t('decision.signInToAnalyze')}`
                : `✨ ${t('decision.analyzeBtn')}`}
          </button>
        </div>
        {!isLoggedIn && !isLoading && (
          <p className="du-signin-hint">{t('decision.signInHint')}</p>
        )}

        {/* ── Plan usage bar ── */}
        <div className={`plan-usage-bar${!isLoggedIn ? ' plan-usage-bar--guest' : ''}`}>
          <div className="plan-usage-left">
            <span className={`plan-badge plan-badge--${plan}`}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</span>
            <span className="plan-usage-text">
              {isLoggedIn
                ? t(plan === 'free' ? 'decision.usageTextReports' : 'decision.usageTextCredits')
                    .replace('{remaining}', String(remaining)).replace('{limit}', String(planLimit))
                : t('decision.usageGuest')}
            </span>
          </div>
          {isLoggedIn && (
            <div className="plan-usage-bar-track">
              <div
                className="plan-usage-bar-fill"
                style={{ width: `${usagePct}%`, background: usagePct >= 90 ? '#EF4444' : '#3B82F6' }}
              />
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="du-error">
            <span className="du-error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  )
}
