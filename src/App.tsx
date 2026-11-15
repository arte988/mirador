import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SkipLink from './components/a11y/SkipLink.tsx'
import HandoffListener from './components/layout/HandoffListener.tsx'
import LanguageSwitch from './components/layout/LanguageSwitch.tsx'
import HudLayout from './components/layout/HudLayout.tsx'
import PlanLayout from './components/layout/PlanLayout.tsx'
import WalkLayout from './components/layout/WalkLayout.tsx'
import { useMissionStore } from './stores/useMissionStore.ts'

function Header() {
  const { t } = useTranslation()
  const loc = useLocation()
  const setDisplay = useMissionStore((s) => s.setDisplayMode)
  const link = ({ isActive }: { isActive: boolean }) =>
    `btn btn-sm ${isActive ? 'border-go text-go' : ''}`
  const hud = loc.pathname.startsWith('/hud')
  return (
    <header className={`flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 ${hud ? 'max-md:hidden' : ''}`}>
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-extrabold tracking-[0.2em] text-go">{t('app.name')}</span>
        <span className="hidden text-xs text-muted sm:inline">{t('app.site')}</span>
      </div>
      <nav aria-label={t('nav.primary')} className="flex items-center gap-2">
        <NavLink to="/plan" className={link} onClick={() => setDisplay('habitat')}>{t('nav.plan')}</NavLink>
        <NavLink to="/walk" className={link} onClick={() => setDisplay('tablet')}>{t('nav.walk')}</NavLink>
        <NavLink to="/hud" className={link} onClick={() => setDisplay('hud')}>{t('nav.hud')}</NavLink>
      </nav>
      <LanguageSwitch />
    </header>
  )
}

function Home() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <h1 className="text-3xl font-bold">{t('home.title')}</h1>
      <p className="text-fg/90">{t('app.tagline')}</p>
      <p className="text-muted">{t('home.body')}</p>
      <div className="card p-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('home.aiTitle')}</h2>
        <p className="mt-1 text-sm text-fg">{t('home.aiBody')}</p>
      </div>
      <div>
        <NavLink to="/plan" className="btn btn-primary">{t('home.start')}</NavLink>
      </div>
      <p className="card p-3 text-sm text-muted">{t('home.honesty')}</p>
      <div className="card p-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('demo.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('demo.body')}</p>
      </div>
      <div className="card p-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t('credits.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('credits.body')}</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <SkipLink />
      <Header />
      <HandoffListener />
      <main id="main" className="min-h-0 flex-1 overflow-hidden" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plan" element={<PlanLayout />} />
          <Route path="/walk" element={<WalkLayout />} />
          <Route path="/hud" element={<HudLayout />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
