// One importance scale across both systems. HubSpot says HIGH/MEDIUM/LOW/NONE;
// Planner says urgent/important/medium/low (the backend leaves Planner's
// default "medium" unset, matching Planner's own board, which shows no marker
// for it). Tasks without a level stay blank rather than borrowing one.
//
// Each icon is a filled circle with a white glyph, described once as shapes so
// the React icon and the PDF (which takes an SVG string) draw the same thing.
// The colours are fixed hex rather than theme tokens: the badge carries its
// own background, so it reads the same on light, dark and paper.

const STROKE = { fill: 'none', stroke: '#ffffff', strokeLinecap: 'round', strokeLinejoin: 'round' }

export const IMPORTANCE_LEVELS = {
  urgent: {
    label: 'Urgent',
    rank: 4,
    color: '#dc2626',
    shapes: [
      { tag: 'path', d: 'M8 4.25v4.6', strokeWidth: 2, ...STROKE },
      { tag: 'circle', cx: 8, cy: 11.55, r: 1.15, fill: '#ffffff' },
    ],
  },
  high: {
    label: 'High',
    rank: 3,
    color: '#ea580c',
    shapes: [{ tag: 'path', d: 'M4.75 9.6 8 6.35l3.25 3.25', strokeWidth: 2, ...STROKE }],
  },
  medium: {
    label: 'Medium',
    rank: 2,
    color: '#d97706',
    shapes: [{ tag: 'path', d: 'M5 6.6h6M5 9.4h6', strokeWidth: 1.75, ...STROKE }],
  },
  low: {
    label: 'Low',
    rank: 1,
    color: '#64748b',
    shapes: [{ tag: 'path', d: 'M4.75 6.4 8 9.65l3.25-3.25', strokeWidth: 2, ...STROKE }],
  },
}

export const IMPORTANCE_ORDER = ['urgent', 'high', 'medium', 'low']

const PRIORITY_TO_LEVEL = {
  // HubSpot
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  // Planner
  urgent: 'urgent',
  important: 'high',
  medium: 'medium',
  low: 'low',
}

/** 'urgent' | 'high' | 'medium' | 'low', or null when the task has none. */
export function importanceOf(task) {
  const priority = task?.priority
  if (!priority) return null
  return PRIORITY_TO_LEVEL[priority] ?? PRIORITY_TO_LEVEL[String(priority).toUpperCase()] ?? null
}

/** Sort key: higher is more important; tasks with no level rank 0. */
export function importanceRank(task) {
  const level = importanceOf(task)
  return level ? IMPORTANCE_LEVELS[level].rank : 0
}

function kebab(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/** The same drawing as <ImportanceIcon>, as an SVG string for the PDF. */
export function importanceSvg(level, size = 16) {
  const spec = IMPORTANCE_LEVELS[level]
  if (!spec) return null
  const shapes = spec.shapes
    .map(({ tag, ...attrs }) => {
      const rendered = Object.entries(attrs)
        .map(([key, value]) => `${kebab(key)}="${value}"`)
        .join(' ')
      return `<${tag} ${rendered}/>`
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}">` +
    `<circle cx="8" cy="8" r="8" fill="${spec.color}"/>${shapes}</svg>`
  )
}
