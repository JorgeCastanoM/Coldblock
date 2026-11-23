// The signed-in token lists which nav sections that person may open.
// overview / deals / team are the sales pages beside Sales Pipeline.

export const SECTIONS = [
  { key: 'overview', to: '/sales-overview', label: 'Overview', group: 'sales' },
  { key: 'deals', to: '/deals', label: 'Deals', group: 'sales' },
  { key: 'team', to: '/team-performance', label: 'Team', group: 'sales' },
  { key: 'pipeline', to: '/quarterly', label: 'Sales Pipeline', group: 'sales' },
  { key: 'tasks', to: '/tasks', label: 'Tasks', group: 'tasks' },
]

const ALL_KEYS = SECTIONS.map((section) => section.key)

export function sectionsFromToken(token) {
  if (!token) return []
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    if (Array.isArray(payload.sections) && payload.sections.length > 0) return payload.sections
  } catch {
    // A token from before sections existed still opens the whole dashboard.
  }
  return ALL_KEYS
}

export function homePath(sections) {
  const allowed = new Set(sections)
  return SECTIONS.find((section) => allowed.has(section.key))?.to ?? '/quarterly'
}
