import { useTranslation } from 'react-i18next'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import ClimatePanel from '../climate/ClimatePanel.tsx'
import Checklist from '../eva/Checklist.tsx'
import ShareCard from '../eva/ShareCard.tsx'
import WalkControls from '../eva/WalkControls.tsx'
import ImagePanel from '../images/ImagePanel.tsx'
import LayerPanel from '../layers/LayerPanel.tsx'
import RoutePanel from '../route/RoutePanel.tsx'
import SafetyPanel from '../safety/SafetyPanel.tsx'

/** Bottom sheet for tablet / phone: the left rail is hidden below md. */
export default function Sheet() {
  const { t } = useTranslation()
  const open = useMissionStore((s) => s.sheetOpen)
  const panel = useMissionStore((s) => s.panel)
  const { setSheetOpen, setPanel } = useMissionStore.getState()
  const tabs = ['route', 'safety', 'climate', 'layers', 'images', 'eva'] as const
  if (!open) {
    return (
      <button type="button" className="btn btn-primary pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2 md:hidden" onClick={() => setSheetOpen(true)}>
        {t('shell.sheetOpen')}
      </button>
    )
  }
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] flex-col rounded-t-2xl border-t border-line bg-surface md:hidden" role="dialog" aria-label={t('nav.panels')}>
      <div className="flex items-center gap-2 border-b border-line p-2">
        <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {tabs.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={panel === id} title={t(id === 'eva' ? 'eva.short' : `nav.${id}`)} className={`btn btn-sm shrink-0 whitespace-nowrap ${panel === id ? 'btn-primary' : ''}`} onClick={() => setPanel(id)}>
              {t(id === 'eva' ? 'eva.short' : `nav.tab.${id}`)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setSheetOpen(false)} aria-label={t('shell.sheetClose')}>{t('app.close')}</button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        {panel === 'route' && <RoutePanel />}
        {panel === 'safety' && <SafetyPanel />}
        {panel === 'climate' && <ClimatePanel />}
        {panel === 'layers' && <LayerPanel />}
        {panel === 'images' && <ImagePanel />}
        {panel === 'eva' && (
          <div className="flex flex-col gap-4">
            <WalkControls />
            <Checklist />
            <ShareCard />
          </div>
        )}
      </div>
    </div>
  )
}
