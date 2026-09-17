import type { AppTab } from '../components/Layout/AppTabs'

export interface Preferences {
  openingTab: AppTab
  autoPreview: boolean
  showEquationGraph: boolean
}
export const defaultPreferences: Preferences = { openingTab: 'images', autoPreview: true, showEquationGraph: true }
const key = 'wallcarousel.preferences.v1'
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    return {
      openingTab: ['images', 'carousel', 'slideshow', 'settings'].includes(value.openingTab) ? value.openingTab : 'images',
      autoPreview: typeof value.autoPreview === 'boolean' ? value.autoPreview : true,
      showEquationGraph: typeof value.showEquationGraph === 'boolean' ? value.showEquationGraph : true,
    }
  } catch { return { ...defaultPreferences } }
}
export function savePreferences(preferences: Preferences) {
  localStorage.setItem(key, JSON.stringify(preferences))
}
