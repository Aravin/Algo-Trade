import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
  textClassName?: string
}

export function AppLogo({
  size = 'md',
  showText = false,
  className,
  textClassName,
}: AppLogoProps) {
  const containerSizes = {
    sm: 'w-7 h-7 rounded-md shadow-sm shadow-violet-500/20',
    md: 'w-9 h-9 rounded-lg shadow-md shadow-violet-500/15',
    lg: 'w-12 h-12 rounded-xl shadow-lg shadow-violet-500/10',
  }

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 24,
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'flex items-center justify-center bg-violet-600 text-white shrink-0',
          containerSizes[size],
        )}
      >
        <TrendingUp size={iconSizes[size]} />
      </div>
      {showText && (
        <span
          className={cn(
            'font-semibold tracking-tight',
            size === 'lg'
              ? 'text-2xl text-white'
              : 'text-sm text-sidebar-foreground',
            textClassName,
          )}
        >
          AlgoTrade
        </span>
      )}
    </div>
  )
}
