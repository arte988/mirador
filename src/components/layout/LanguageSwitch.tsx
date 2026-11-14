import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS, setLang, type Lang } from '../../i18n'

/** EN | ES toggle. English is the default; the choice is persisted in localStorage["mirador.lang"]. */
export default function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const current = (i18n.language === 'es' ? 'es' : 'en') as Lang
  return (
    <div role="group" aria-label={t('lang.label')} className="inline-flex overflow-hidden rounded-lg border border-line">
      {SUPPORTED_LANGS.map((lng) => (
        <button
          key={lng}
          type="button"
          className="btn rounded-none border-0 px-3"
          style={{ background: current === lng ? 'var(--color-go)' : 'var(--color-surface-2)', color: current === lng ? '#001014' : undefined }}
          aria-pressed={current === lng}
          aria-label={`${t('lang.switchTo')}: ${t(`lang.${lng}`)}`}
          onClick={() => setLang(lng)}
        >
          {t(`lang.${lng}`)}
        </button>
      ))}
    </div>
  )
}
