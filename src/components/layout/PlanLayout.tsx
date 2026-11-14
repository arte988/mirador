import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SITES } from '../../data/sites.ts'
import { daylightRemainingMin, nextLtst } from '../../lib/solar.ts'
import { useAutoPlan } from '../../lib/useAutoPlan.ts'
import { useSafetyEngine } from '../../lib/useSafety.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import ImagePanel from '../images/ImagePanel.tsx'
import LayerPanel from '../layers/LayerPanel.tsx'
import MarsMap from '../map/MarsMap.tsx'
import SafetyPanel, { SafetyBadge } from '../safety/SafetyPanel.tsx'
import ProfilePanel from '../route/ProfilePanel.tsx'
import RoutePanel from '../route/RoutePanel.tsx'
import Sheet from './Sheet.tsx'

type Tab = 'route' | 'safety' | 'layers' | 'images'

/** Interim Habitat arrangement: left rail (route / layers), map in the center, profile below. Full shells land in prompt 11. */
export default function PlanLayout() {
  const { t } = useTranslation()
  useAutoPlan()
  useSafetyEngine()
  const panel = useMissionStore((s) => s.panel)
  const dataMode = useMissionStore((s) => s.dataMode)
  const scenario = useMissionStore((s) => s.scenario)
  const banner = dataMode === 'analog' ? 'analog' : dataMode === 'rehearsal' ? 'rehearsal' : scenario.dustStorm || scenario.sepAlert || scenario.o2Leak ? 'scenario' : null
  const setPanel = useMissionStore((s) => s.setPanel)
  // A remembered rehearsal/analog mode is a daytime demo: if the Sun is down at Gale on load, start at 10:00 local.
  useEffect(() => {
    const st = useMissionStore.getState()
    if (st.dataMode === 'live' || st.scenarioTimeMs !== null) return
    const [lon, lat] = SITES.gale.center
    if (daylightRemainingMin(new Date(), lon, lat) <= 0) st.setScenarioTime(nextLtst(new Date(), lon, 10).getTime())
  }, [])
  const tab: Tab = panel === 'layers' ? 'layers' : panel === 'safety' ? 'safety' : panel === 'images' ? 'images' : 'route'
  const tabs: Tab[] = ['route', 'safety', 'layers', 'images']
  return (
    <div className="flex h-full min-h-0">
      <aside aria-label={t('nav.panels')} className="scrollbar-thin flex w-80 shrink-0 flex-col overflow-hidden border-r border-line bg-surface max-md:hidden">
        <div className="shrink-0 border-b border-line p-2">
          <SafetyBadge onClick={() => setPanel('safety')} />
        </div>
        <div role="tablist" aria-label={t('nav.panels')} className="grid shrink-0 grid-cols-4 gap-1 border-b border-line p-2">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              className={`btn btn-sm ${tab === id ? 'btn-primary' : ''}`}
              onClick={() => setPanel(id)}
            >
              {t(`nav.${id}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'route' ? <RoutePanel /> : tab === 'safety' ? <SafetyPanel /> : tab === 'images' ? <ImagePanel /> : <LayerPanel />}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {banner && (
          <p className="shrink-0 border-b border-caution bg-caution/15 px-3 py-1 text-center text-xs font-bold uppercase tracking-wider text-caution" role="status">
            {t(`safety.topBanner.${banner}`)}
          </p>
        )}
        <div className="relative min-h-0 flex-1">
          <MarsMap />
          <Sheet />
        </div>
        <ProfilePanel />
      </div>
    </div>
  )
}
