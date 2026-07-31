import { useId, useState } from 'react'

// Single-hue trend line following the same mark specs as BarChart: hairline
// gridlines rounded to clean steps, direct axis labels, hover tooltip via an
// oversized per-point hit area. Single series → no legend (title says what's plotted).
export default function LineChart({ data, formatValue = (v) => v.toLocaleString(), height = 220, lineColor = '#38bdf8' }) {
  const [hovered, setHovered] = useState(null)
  const gradientId = useId()

  const width = 640
  const paddingLeft = 56
  const paddingRight = 8
  const paddingBottom = 28
  const paddingTop = 16
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  const maxValue = Math.max(1, ...data.map((d) => d.value))
  // Round the axis ceiling to a clean step (1/2/5 × 10^n) so ticks land on
  // nice numbers rather than an arbitrary fraction of the max.
  const magnitude = 10 ** Math.floor(Math.log10(maxValue))
  const steps = [1, 2, 2.5, 5, 10]
  const niceStep = steps.map((s) => s * magnitude).find((s) => maxValue / s <= 5) ?? magnitude * 10
  const axisMax = Math.ceil(maxValue / niceStep) * niceStep
  const tickCount = Math.round(axisMax / niceStep)
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * niceStep)

  const slotWidth = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth
  const pointX = (index) => (data.length > 1 ? paddingLeft + index * slotWidth : paddingLeft + plotWidth / 2)
  const pointY = (value) => paddingTop + plotHeight - (axisMax > 0 ? (value / axisMax) * plotHeight : 0)
  const clampTooltipX = (x) => Math.min(Math.max(x, paddingLeft + 36), width - paddingRight - 36)

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${pointX(i)} ${pointY(d.value)}`).join(' ')
  const areaPath =
    data.length > 0
      ? `${linePath} L ${pointX(data.length - 1)} ${paddingTop + plotHeight} L ${pointX(0)} ${paddingTop + plotHeight} Z`
      : ''

  // Thin x-axis labels so roughly 8 show regardless of how many points there
  // are — a fixed step of 2 (fine for 12 points) would still cram ~26 labels
  // in for a 52-point range, so this scales the step with the data length.
  const labelStep = Math.max(1, Math.ceil(data.length / 8))

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Line chart">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Hairline gridlines at clean value steps */}
        {ticks.map((tick) => {
          const y = paddingTop + plotHeight - (tick / axisMax) * plotHeight
          return (
            <g key={tick}>
              <line x1={paddingLeft} x2={width - paddingRight} y1={y} y2={y} stroke="#2a2e37" strokeWidth="1" />
              <text x={paddingLeft - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[10px]">
                {formatValue(tick)}
              </text>
            </g>
          )
        })}

        {/* Baseline */}
        <line
          x1={paddingLeft}
          x2={width - paddingRight}
          y1={paddingTop + plotHeight}
          y2={paddingTop + plotHeight}
          stroke="#3f4451"
          strokeWidth="1"
        />

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
        {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}

        {data.map((d, index) => {
          const x = pointX(index)
          const y = pointY(d.value)
          const isHovered = hovered === index
          const tooltipX = clampTooltipX(x)
          const tooltipTop = Math.max(y - 34, 2)
          return (
            <g key={d.label}>
              {/* Transparent hit area, bigger than the visible point */}
              <rect
                x={x - slotWidth / 2}
                y={paddingTop}
                width={slotWidth}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${formatValue(d.value)}`}
              />
              <circle cx={x} cy={y} r={isHovered ? 5 : 3} fill={lineColor} className="transition-all" />
              {isHovered && (
                <g>
                  <rect x={tooltipX - 34} y={tooltipTop} width={68} height={22} rx={5} fill="#0f1115" stroke="#3f4451" />
                  <text x={tooltipX} y={tooltipTop + 15} textAnchor="middle" className="fill-slate-100 text-[11px] font-medium">
                    {formatValue(d.value)}
                  </text>
                </g>
              )}
              {index % labelStep === 0 && (
                <text x={x} y={paddingTop + plotHeight + 18} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
