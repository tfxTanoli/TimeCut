import { useState } from 'react'
import type { TimeCutReport } from '../types'
import ScoreGauge from './ScoreGauge'
import { useAuth } from '../contexts/AuthContext'
import { useAuthModal } from '../contexts/AuthModalContext'
import { logActivity } from '../lib/userService'

interface Props {
  report: TimeCutReport
  onBack: () => void
  language?: string
}

const VERDICT_CLASS: Record<string, string> = {
  'MUST READ':          'verdict-badge--must',
  'HIGHLY RECOMMENDED': 'verdict-badge--highly',
  'GOOD READ':          'verdict-badge--good',
  'LIGHT READ':         'verdict-badge--light',
  'WORTH A GLANCE':     'verdict-badge--glance',
  'SKIM ONLY':          'verdict-badge--skim',
  'DEEP DIVE':          'verdict-badge--deep',
  'HIDDEN GEM':         'verdict-badge--gem',
  'MASTERPIECE':        'verdict-badge--masterpiece',
  'OVERRATED':          'verdict-badge--overrated',
  'SKIP IT':            'verdict-badge--skip',
  'TIME WASTER':        'verdict-badge--waster',
}

const UI_LABELS: Record<string, Record<string, string>> = {
  'Chinese (Simplified)': {
    'TIME INTELLIGENCE REPORT': '时间智能报告',
    'Back to home': '返回首页',
    'Download Report': '下载报告',
    'Share': '分享',
    'VERDICT': '判决',
    'TIME SAVED': '节省时间',
    'mins': '分钟',
    'Estimated time you can safely skip': '您可以安全跳过的预计时间',
    'Enough time to: finish a workout · call your parents · watch a movie': '足够时间：完成锻炼·给父母打电话·看电影',
    'VALUE SCORE': '价值评分',
    'Based on information density, originality & usefulness': '基于信息密度、原创性和实用性',
    'ATTENTION QUALITY': '注意力质量',
    'ORIGINALITY DETECTED': '原创性检测',
    'EVIDENCE DENSITY': '证据密度',
    'REPETITION SCORE': '重复评分',
    'lower is better': '越低越好',
    'INSIGHT UNIQUENESS': '洞察独特性',
    'WHAT THIS IS ABOUT': '内容概述',
    'KEY INSIGHTS': '关键洞察',
    'WHAT TO SKIP': '可跳过部分',
    'BEST FOR': '适合人群',
    'FINAL DECISION': '最终建议',
    'OVERALL VALUE SCORE': '总体价值评分',
    'Your life attention is precious.': '您的注意力是宝贵的。',
    'Stop giving it away blindly.': '请不要盲目浪费它。',
    'Analyze Another': '分析另一篇',
    'MUST READ': '必读',
    'HIGHLY RECOMMENDED': '强烈推荐',
    'GOOD READ': '值得一读',
    'LIGHT READ': '轻松阅读',
    'WORTH A GLANCE': '值得一看',
    'SKIM ONLY': '仅需浏览',
    'DEEP DIVE': '深度阅读',
    'HIDDEN GEM': '隐藏宝藏',
    'MASTERPIECE': '杰作',
    'OVERRATED': '被高估',
    'SKIP IT': '跳过',
    'TIME WASTER': '浪费时间',
  },
  'Chinese (Traditional)': {
    'TIME INTELLIGENCE REPORT': '時間智能報告',
    'Back to home': '返回首頁',
    'Download Report': '下載報告',
    'Share': '分享',
    'VERDICT': '判決',
    'TIME SAVED': '節省時間',
    'mins': '分鐘',
    'Estimated time you can safely skip': '您可以安全跳過的預計時間',
    'Enough time to: finish a workout · call your parents · watch a movie': '足夠時間：完成鍛鍊·給父母打電話·看電影',
    'VALUE SCORE': '價值評分',
    'Based on information density, originality & usefulness': '基於資訊密度、原創性和實用性',
    'ATTENTION QUALITY': '注意力品質',
    'ORIGINALITY DETECTED': '原創性檢測',
    'EVIDENCE DENSITY': '證據密度',
    'REPETITION SCORE': '重複評分',
    'lower is better': '越低越好',
    'INSIGHT UNIQUENESS': '洞察獨特性',
    'WHAT THIS IS ABOUT': '內容概述',
    'KEY INSIGHTS': '關鍵洞察',
    'WHAT TO SKIP': '可跳過部分',
    'BEST FOR': '適合人群',
    'FINAL DECISION': '最終建議',
    'OVERALL VALUE SCORE': '總體價值評分',
    'Your life attention is precious.': '您的注意力是寶貴的。',
    'Stop giving it away blindly.': '請不要盲目浪費它。',
    'Analyze Another': '分析另一篇',
    'MUST READ': '必讀',
    'HIGHLY RECOMMENDED': '強烈推薦',
    'GOOD READ': '值得一讀',
    'LIGHT READ': '輕鬆閱讀',
    'WORTH A GLANCE': '值得一看',
    'SKIM ONLY': '僅需瀏覽',
    'DEEP DIVE': '深度閱讀',
    'HIDDEN GEM': '隱藏寶藏',
    'MASTERPIECE': '傑作',
    'OVERRATED': '被高估',
    'SKIP IT': '跳過',
    'TIME WASTER': '浪費時間',
  },
  'Korean': {
    'TIME INTELLIGENCE REPORT': '시간 지능 보고서',
    'Back to home': '홈으로',
    'Download Report': '보고서 다운로드',
    'Share': '공유',
    'VERDICT': '판정',
    'TIME SAVED': '절약 시간',
    'mins': '분',
    'Estimated time you can safely skip': '안전하게 건너뛸 수 있는 예상 시간',
    'Enough time to: finish a workout · call your parents · watch a movie': '충분한 시간: 운동 완료·부모님께 전화·영화 감상',
    'VALUE SCORE': '가치 점수',
    'Based on information density, originality & usefulness': '정보 밀도, 독창성 및 유용성 기반',
    'ATTENTION QUALITY': '주의력 품질',
    'ORIGINALITY DETECTED': '독창성 감지',
    'EVIDENCE DENSITY': '증거 밀도',
    'REPETITION SCORE': '반복 점수',
    'lower is better': '낮을수록 좋음',
    'INSIGHT UNIQUENESS': '통찰 독창성',
    'WHAT THIS IS ABOUT': '내용 요약',
    'KEY INSIGHTS': '핵심 인사이트',
    'WHAT TO SKIP': '건너뛸 부분',
    'BEST FOR': '추천 대상',
    'FINAL DECISION': '최종 결정',
    'OVERALL VALUE SCORE': '전체 가치 점수',
    'Your life attention is precious.': '당신의 주의력은 소중합니다.',
    'Stop giving it away blindly.': '맹목적으로 낭비하지 마세요.',
    'Analyze Another': '다른 콘텐츠 분석',
    'MUST READ': '필독',
    'HIGHLY RECOMMENDED': '강력 추천',
    'GOOD READ': '읽을 만함',
    'LIGHT READ': '가볍게 읽기',
    'WORTH A GLANCE': '한번 볼 만함',
    'SKIM ONLY': '훑어보기만',
    'DEEP DIVE': '심층 읽기',
    'HIDDEN GEM': '숨겨진 보석',
    'MASTERPIECE': '걸작',
    'OVERRATED': '과대평가됨',
    'SKIP IT': '건너뛰기',
    'TIME WASTER': '시간 낭비',
  },
}

export default function ResultPage({ report, onBack, language = 'English' }: Props) {
  const { user } = useAuth()
  const { openSignup } = useAuthModal()
  const [copied, setCopied] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<'download' | 'share' | null>(null)

  const t = (key: string) => UI_LABELS[language]?.[key] ?? key

  function handleDownload() {
    if (!user) { setAuthPrompt('download'); return }
    logActivity(user.uid, 'report_downloaded', {
      verdict: report.verdict,
      valueScore: report.value_score,
      timeSavedMinutes: report.time_saved_minutes,
    })
    window.print()
  }

  function handleShare() {
    if (!user) { setAuthPrompt('share'); return }
    const text = `Time Intelligence Report\n\nVerdict: ${report.verdict}\n${report.verdict_description}\n\nValue Score: ${report.value_score}/10\nTime Saved: ${report.time_saved_minutes} mins\n\nFinal Decision:\n${report.final_decision}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      logActivity(user.uid, 'report_shared', {
        verdict: report.verdict,
        valueScore: report.value_score,
      })
    })
  }

  const verdictClass = VERDICT_CLASS[report.verdict] ?? 'verdict-badge--skip'
  const verdictDisplay = t(report.verdict)

  const attnClass =
    report.attention_quality === 'High'
      ? 'attn--high'
      : report.attention_quality === 'Medium'
        ? 'attn--medium'
        : 'attn--low'

  return (
    <div className="result-page">
      {/* ── Result Nav ── */}
      <div className="result-nav">
        <div className="container result-nav-inner">
          <button className="back-btn" onClick={onBack}>{t('Back to home')}</button>
          <h2 className="result-nav-title">{t('TIME INTELLIGENCE REPORT')}</h2>
          <div className="result-nav-actions">
            <button className="icon-btn" onClick={handleDownload}>{t('Download Report')}</button>
            <button className="icon-btn" onClick={handleShare}>{copied ? '✓ Copied!' : t('Share')}</button>
          </div>
        </div>
      </div>

      {authPrompt && (
        <div className="auth-prompt-banner">
          <span className="auth-prompt-icon">🔒</span>
          <p className="auth-prompt-msg">
            {authPrompt === 'download'
              ? 'Please sign up or log in to download your report.'
              : 'Please sign up or log in to share your report.'}
          </p>
          <div className="auth-prompt-actions">
            <button className="btn-primary btn-sm" onClick={() => { setAuthPrompt(null); openSignup() }}>
              Sign up free
            </button>
            <button className="auth-prompt-dismiss" onClick={() => setAuthPrompt(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="container result-content">
        {/* ── Verdict Card ── */}
        <div className="verdict-card">
          <div className="verdict-icon">
            <IconDoc />
          </div>
          <div className="verdict-body">
            <p className="verdict-eyebrow">{t('VERDICT')}</p>
            <h2 className={`verdict-title verdict-badge ${verdictClass}`}>{verdictDisplay}</h2>
            <p className="verdict-desc">{report.verdict_description}</p>
          </div>
          <ScoreGauge score={report.overall_value_score} label={t('OVERALL VALUE SCORE')} />
        </div>

        {/* ── Metrics Row ── */}
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-icon metric-icon--purple"><IconClock /></div>
            <div>
              <p className="metric-label">{t('TIME SAVED')}</p>
              <p className="metric-value">{report.time_saved_minutes} {t('mins')}</p>
              <p className="metric-sub">{t('Estimated time you can safely skip')}</p>
              <p className="metric-enough">{t('Enough time to: finish a workout · call your parents · watch a movie')}</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-icon--amber"><IconStar /></div>
            <div>
              <p className="metric-label">{t('VALUE SCORE')}</p>
              <p className="metric-value">{report.value_score.toFixed(1)} <span className="metric-denom">/ 10</span></p>
              <p className="metric-sub">{t('Based on information density, originality & usefulness')}</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-icon--green"><IconPulse /></div>
            <div>
              <p className="metric-label">{t('ATTENTION QUALITY')}</p>
              <p className={`metric-value ${attnClass}`}>{report.attention_quality}</p>
              <p className="metric-sub">{report.attention_quality_description}</p>
            </div>
          </div>
        </div>

        {/* ── Content Analysis Metrics ── */}
        <div className="content-analysis-row">
          <div className="ca-card">
            <p className="ca-label">{t('ORIGINALITY DETECTED')}</p>
            <p className="ca-score">{(report.originality_score ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
          </div>
          <div className="ca-card">
            <p className="ca-label">{t('EVIDENCE DENSITY')}</p>
            <p className="ca-score">{(report.evidence_density ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
          </div>
          <div className="ca-card">
            <p className="ca-label">{t('REPETITION SCORE')}</p>
            <p className="ca-score">{(report.repetition_score ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
            <p className="ca-hint">{t('lower is better')}</p>
          </div>
          <div className="ca-card">
            <p className="ca-label">{t('INSIGHT UNIQUENESS')}</p>
            <p className="ca-score">{(report.insight_uniqueness ?? 0).toFixed(1)}<span className="ca-denom"> / 10</span></p>
          </div>
        </div>

        {/* ── Analysis Grid ── */}
        <div className="analysis-grid">
          <div className="analysis-card">
            <div className="analysis-header">
              <IconDoc className="analysis-icon analysis-icon--blue" />
              <p className="analysis-label">{t('WHAT THIS IS ABOUT')}</p>
            </div>
            <p className="analysis-text">{report.what_this_is_about}</p>
          </div>
          <div className="analysis-card">
            <div className="analysis-header">
              <IconCheck className="analysis-icon analysis-icon--green" />
              <p className="analysis-label">{t('KEY INSIGHTS')}</p>
            </div>
            <ul className="bullet-list">
              {report.key_insights.map((ins, i) => <li key={i}>{ins}</li>)}
            </ul>
          </div>
          <div className="analysis-card">
            <div className="analysis-header">
              <IconX className="analysis-icon analysis-icon--red" />
              <p className="analysis-label">{t('WHAT TO SKIP')}</p>
            </div>
            <ul className="bullet-list">
              {report.what_to_skip.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        </div>

        {/* ── Best For + Final Decision ── */}
        <div className="bottom-section">
          <div className="bottom-card">
            <div className="analysis-header">
              <IconUsers className="analysis-icon analysis-icon--purple" />
              <p className="analysis-label">{t('BEST FOR')}</p>
            </div>
            <ul className="bullet-list">
              {report.best_for.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
          <div className="bottom-card bottom-card--final">
            <div className="analysis-header">
              <IconDecision className="analysis-icon analysis-icon--purple" />
              <p className="analysis-label">{t('FINAL DECISION')}</p>
            </div>
            <p className="analysis-text">{report.final_decision}</p>
          </div>
        </div>

        {/* ── Bottom Banner ── */}
        <div className="bottom-banner">
          <div className="banner-left">
            <span className="banner-icon">💜</span>
            <div>
              <p className="banner-title">{t('Your life attention is precious.')}</p>
              <p className="banner-sub">{t('Stop giving it away blindly.')}</p>
            </div>
          </div>
          <button className="btn-primary btn-cta" onClick={onBack}>
            {t('Analyze Another')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Inline SVG Icons ── */
function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function IconStar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
function IconPulse() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}
function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconDecision({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
