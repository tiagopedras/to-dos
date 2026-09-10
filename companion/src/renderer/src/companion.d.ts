import type { CompanionApi } from '../../shared/types.js'

declare global {
  interface Window {
    companion: CompanionApi
  }
}
