import { create } from 'zustand'
import type { ToolResult } from './tools.ts'

export interface ToolLogEntry { id: string; at: number; name: string; args: unknown; result: ToolResult }
interface ToolLog { entries: ToolLogEntry[]; add: (entry: ToolLogEntry) => void; clear: () => void }
export const useToolLog = create<ToolLog>((set) => ({
  entries: [],
  add: (entry) => set((s) => ({ entries: [...s.entries, entry].slice(-50) })),
  clear: () => set({ entries: [] }),
}))
