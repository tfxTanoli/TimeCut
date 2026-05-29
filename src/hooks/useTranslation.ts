import { useLanguage } from '../contexts/LanguageContext'
import { t as translate } from '../i18n'

export function useTranslation() {
  const { lang, setLang } = useLanguage()
  return {
    t: (key: string) => translate(lang, key),
    lang,
    setLang,
  }
}
