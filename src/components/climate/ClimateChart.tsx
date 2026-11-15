import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartPoint } from '../../lib/climateChart.ts'

const AXIS = '#94a7bb'
const GRID = '#263548'
const HISTORY = '#e8eef5'
const FORECAST = '#22d3ee'
const BAND = '#22d3ee'
const WHAT_IF = '#ffb020'

export default function ClimateChart({
  points,
  unit,
  caption,
}: {
  points: ChartPoint[]
  unit: string
  caption: string
}) {
  const { t } = useTranslation()
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduce(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  if (points.length === 0) return null
  return (
    <div className="h-52 w-full" role="img" aria-label={caption}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="sol" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} width={48} unit={unit === 'C' ? '°' : ''} />
          <Tooltip
            contentStyle={{ background: '#0b1017', border: '1px solid #263548', borderRadius: 8, color: '#e8eef5' }}
            labelFormatter={(sol) => t('climate.solTip', { sol })}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#e8eef5' }} />
          <Area
            name={t('climate.band')}
            dataKey="band"
            stroke="none"
            fill={BAND}
            fillOpacity={0.22}
            isAnimationActive={!reduce}
            legendType="square"
          />
          <Line
            name={t('climate.history')}
            dataKey="history"
            stroke={HISTORY}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={!reduce}
          />
          <Line
            name={t('climate.forecastLine')}
            dataKey="forecast"
            stroke={FORECAST}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={!reduce}
          />
          {points.some((p) => p.whatIf !== null) && (
            <Line
              name={t('climate.whatIfLine')}
              dataKey="whatIf"
              stroke={WHAT_IF}
              strokeWidth={2}
              strokeDasharray="2 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={!reduce}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
