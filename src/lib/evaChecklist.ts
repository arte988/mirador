/** Pre-walk checklist. Items are rehearsal prompts, not a certified EVA procedure. */
export const CHECKLIST = [
  { id: 'suit', group: 'suit' },
  { id: 'o2', group: 'suit' },
  { id: 'battery', group: 'suit' },
  { id: 'comms', group: 'comms' },
  { id: 'buddy', group: 'comms' },
  { id: 'route', group: 'plan' },
  { id: 'daylight', group: 'plan' },
  { id: 'safety', group: 'plan' },
] as const

export type CheckId = (typeof CHECKLIST)[number]['id']
