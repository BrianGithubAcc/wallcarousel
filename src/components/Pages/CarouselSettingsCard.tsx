import type {
  ReactNode,
} from 'react'

interface CarouselSettingsCardProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export function CarouselSettingsCard({
  title,
  subtitle,
  actions,
  children,
}: CarouselSettingsCardProps) {
  return (
    <section className="wc-settings-card">
      <header className="wc-settings-card-header">
        <div>
          <h2 className="wc-settings-card-title">
            {title}
          </h2>

          {subtitle ? (
            <p className="wc-settings-card-subtitle">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="wc-settings-card-actions">
            {actions}
          </div>
        ) : null}
      </header>

      <div className="wc-settings-card-body">
        {children}
      </div>
    </section>
  )
}
