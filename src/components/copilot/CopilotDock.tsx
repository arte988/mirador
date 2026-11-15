import { lazy, Suspense } from 'react'
const CopilotPanel = lazy(() => import('./CopilotPanel.tsx'))
export default function CopilotDock({ compact = false }: { compact?: boolean }) {
  return <Suspense fallback={null}><CopilotPanel compact={compact} /></Suspense>
}
