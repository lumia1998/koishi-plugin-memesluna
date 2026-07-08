import { inject, type InjectionKey } from 'vue'
import type { useDashboard } from './useDashboard'

export type DashboardContext = ReturnType<typeof useDashboard>

export const dashboardContextKey: InjectionKey<DashboardContext> = Symbol('MemesLunaDashboardContext')

export function useDashboardContext(): DashboardContext {
  const context = inject(dashboardContextKey)
  if (!context) {
    throw new Error('MemesLuna dashboard context is not available.')
  }
  return context
}
