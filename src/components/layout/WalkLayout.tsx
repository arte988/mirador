import { useTranslation } from 'react-i18next'
import { useClock } from '../../lib/useClock.ts'
import { useAutoPlan } from '../../lib/useAutoPlan.ts'
import { useSafetyEngine } from '../../lib/useSafety.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import Checklist from '../eva/Checklist.tsx'
import ShareCard from '../eva/ShareCard.tsx'
import WalkControls from '../eva/WalkControls.tsx'
import MarsMap from '../map/MarsMap.tsx'
import CopilotDock from '../copilot/CopilotDock.tsx'
import { SafetyBadge } from '../safety/SafetyPanel.tsx'
import Sheet from './Sheet.tsx'

export default function WalkLayout() {
  const { t } = useTranslation()
  useAutoPlan()
  useSafetyEngine()
  useClock()
  const dataMode = useMissionStore((s) => s.dataMode)
  const scenario = useMissionStore((s) => s.scenario)
  const banner = dataMode === 'analog' ? 'analog' : dataMode === 'rehearsal' ? 'rehearsal' : scenario.dustStorm || scenario.sepAlert || scenario.o2Leak ? 'scenario' : null
  return (
    <div className="flex h-full min-h-0">
      <aside aria-label={t('eva.aside')} className="scrollbar-thin flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-3 max-md:hidden">
        <SafetyBadge />
        <WalkControls />
        <Checklist />
        <ShareCard />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {banner && (
          <p className="shrink-0 border-b border-caution bg-caution/15 px-3 py-1 text-center text-xs font-bold uppercase tracking-wider text-caution" role="status">
            {t(`safety.topBanner.${banner}`)}
          </p>
        )}
        <div className="relative min-h-0 flex-1">
          <MarsMap />
          <CopilotDock />
          <Sheet />
        </div>
      </div>
    </div>
  )
}
