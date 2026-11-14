import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'
import { es } from './es'

export const LANG_KEY = 'mirador.lang'
export type Lang = 'en' | 'es'
export const SUPPORTED_LANGS: Lang[] = ['en', 'es']

export function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'en' || v === 'es') return v
  } catch {
    /* storage unavailable */
  }
  return 'en' // English is the default; Spanish is an opt-in toggle.
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: readStoredLang(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGS,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang
  void i18n.changeLanguage(lang)
}

document.documentElement.lang = readStoredLang()

export default i18n
