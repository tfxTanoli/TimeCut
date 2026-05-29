import { createContext, useContext, useState } from 'react'

interface LanguageContextType {
  lang: string
  setLang: (l: string) => void
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'English',
  setLang: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(
    () => localStorage.getItem('ui-lang') ?? 'English'
  )

  function setLang(l: string) {
    setLangState(l)
    localStorage.setItem('ui-lang', l)
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
