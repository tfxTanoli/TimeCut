import en from './en'
import zhCN from './zh-CN'
import zhTW from './zh-TW'

export const translations: Record<string, Record<string, string>> = {
  'English': en,
  'Chinese (Simplified)': zhCN,
  'Chinese (Traditional)': zhTW,
}

export function t(lang: string, key: string): string {
  return translations[lang]?.[key] ?? translations['English']?.[key] ?? key
}
