import { createContext, useContext, useState } from 'react'
import { translations } from '../i18n'

const FALLBACK_LANG = 'English'
const STORAGE_KEY = 'ui-lang'

interface LanguageContextType {
  lang: string
  setLang: (l: string) => void
}

const LanguageContext = createContext<LanguageContextType>({
  lang: FALLBACK_LANG,
  setLang: () => {},
})

/** A language we actually ship a dictionary for, or English. */
function knownLang(value: string | null | undefined): string {
  return value && value in translations ? value : FALLBACK_LANG
}

/**
 * The stored UI language.
 *
 * `localStorage` is not merely empty when a browser blocks site data — the
 * accessor throws. This provider wraps the whole app, so an unguarded read here
 * took the entire site down rather than degrading to the default, which is what
 * every other storage read in the codebase already does. The stored value is
 * also checked against the shipped dictionaries: a language that has since been
 * removed would otherwise leave the UI rendering bare translation keys.
 */
function readStoredLang(): string {
  try {
    return knownLang(localStorage.getItem(STORAGE_KEY))
  } catch {
    return FALLBACK_LANG
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(readStoredLang)

  function setLang(l: string) {
    const next = knownLang(l)
    setLangState(next)
    // Failing to remember the preference is not worth breaking the switch over.
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* storage unavailable */ }
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
