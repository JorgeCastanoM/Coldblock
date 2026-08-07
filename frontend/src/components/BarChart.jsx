import { useId, useState } from 'react'

// Single-hue bar chart following the dataviz skill's mark specs: ≤24px thick
// bars, 4px rounded data-end / square baseline, hairline gridlines, direct
// value labels, per-bar hover tooltip. Single series → no legend box (the
// chart title already says what's plotted).
export default function BarChart({ data, formatValue = (v) => v.toLocaleString(), height = 220, barColor = '#38bdf8' }) {
  const [hovered, setHovered] = useState(null)
  const gradientId = useId()

  const width = 640
  const paddingLeft = 56
  const paddingBottom = 28
  const paddingTop = 16
  const plotWidth = width - paddingLeft - 8
  const plotHeight = height - paddingTop - paddingBottom

  const maxValue = Math.max(1, ...data.map((d) => d.value))
  // Round the axis ceiling to a clean step (1/2/5 × 10^n) so ticks land on
  // nice numbers rather than an arbitrary fraction of the max.
  const magnitude = 10 ** Math.floor(Math.log10(maxValue))
  const steps = [1, 2, 2.5, 5, 10];
  const niceStep = steps.map((s) => s * magnitude).find((s) => maxValue / s <= 5) ?? magnitude * 10
  const axisMax = Math.ceil(maxValue / niceStep) * niceStep
  const tickCount = Math.round(axisMax / niceStep)
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * niceStep)

  const slotWidth = plotWidth / data.length
  const barWidth = Math.min(24, slotWidth * 0.55)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Bar chart">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barColor} stopOpacity="1" />
            <stop offset="100%" stopColor={barColor} stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {/* Hairline gridlines at clean value steps */}
        {ticks.map((tick) => {
          const y = paddingTop + plotHeight - (tick / axisMax) * plotHeight
          return (
            <g key={tick}>
              <line
                x1={paddingLeft}
                x2={width - 8}
                y1={y}
                y2={y}
                stroke="var(--chart-grid)"
                strokeWidth="1"
              />
              <text x={paddingLeft - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-ink-subtle text-[10px]">
                {formatValue(tick)}
              </text>
            </g>
          )
        })}

        {/* Baseline */}
        <line
          x1={paddingLeft}
          x2={width - 8}
          y1={paddingTop + plotHeight}
          y2={paddingTop + plotHeight}
          stroke="var(--chart-axis)"
          strokeWidth="1"
        />

        {data.map((d, index) => {
          const barHeight = axisMax > 0 ? (d.value / axisMax) * plotHeight : 0
          const x = paddingLeft + index * slotWidth + (slotWidth - barWidth) / 2
          const y = paddingTop + plotHeight - barHeight
          const isHovered = hovered === index
          return (
            <g key={d.label}>
              {/* Transparent hit area, bigger than the visible bar */}
              <rect
                x={paddingLeft + index * slotWidth}
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
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx={4}
                fill={`url(#${gradientId})`}
                opacity={isHovered ? 1 : 0.9}
                className="transition-opacity"
              />
              {/* Value at the tip */}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className={`text-[11px] font-medium ${isHovered ? 'fill-ink' : 'fill-ink-muted'}`}
              >
                {formatValue(d.value)}
              </text>
              {/* Category label on the x-axis */}
              <text
                x={x + barWidth / 2}
                y={paddingTop + plotHeight + 18}
                textAnchor="middle"
                className="fill-ink-muted text-xs"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
