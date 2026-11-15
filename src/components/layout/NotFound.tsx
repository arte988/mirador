import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="text-fg">{t('notFound.body')}</p>
      <Link to="/plan" className="btn btn-primary w-fit">{t('notFound.back')}</Link>
    </div>
  )
}
