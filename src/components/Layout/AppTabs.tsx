export type AppTab =
  | 'images'
  | 'carousel'
  | 'slideshow'
  | 'settings'

interface AppTabsProps {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
}

export function AppTabs({
  activeTab,
  onChange,
}: AppTabsProps) {
  return (
    <nav className="app-tabs" aria-label="Main navigation">
      <span className="app-brand">wallcarousel</span>
      <button
        type="button"
        className={
          activeTab === 'images'
            ? 'active'
            : ''
        }
        onClick={() =>
          onChange('images')
        }
      >
        Library
      </button>

      <button
        type="button"
        className={
          activeTab === 'carousel'
            ? 'active'
            : ''
        }
        onClick={() =>
          onChange('carousel')
        }
      >
        Carousel
      </button>

      <button type="button" className={activeTab === 'slideshow' ? 'active' : ''}
        onClick={() => onChange('slideshow')}>
        Slideshow
      </button>

      <button
        type="button"
        className={
          activeTab === 'settings'
            ? 'active'
            : ''
        }
        onClick={() =>
          onChange('settings')
        }
      >
        Settings
      </button>
    </nav>
  )
}
