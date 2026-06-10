import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCard {
  title: string
  value: string
  subValue?: string
  change?: string
  changeUp?: boolean
  icon: React.ReactNode
  iconColor: string
}

const stats: StatCard[] = [
  {
    title: 'Portfolio Value',
    value: '₹5,24,320',
    subValue: 'Available: ₹1,85,430',
    change: '+₹12,450 today',
    changeUp: true,
    icon: <Wallet size={18} />,
    iconColor: 'text-primary bg-primary/15',
  },
  {
    title: 'Day P&L',
    value: '+₹12,450',
    subValue: 'Realised: +₹2,310',
    change: '+2.43% of portfolio',
    changeUp: true,
    icon: <TrendingUp size={18} />,
    iconColor: 'text-success bg-success/15',
  },
  {
    title: 'Open Positions',
    value: '4',
    subValue: 'Unrealised: +₹3,290',
    change: '2 CE · 1 PE · 1 EQ',
    changeUp: true,
    icon: <Zap size={18} />,
    iconColor: 'text-warning bg-warning/15',
  },
  {
    title: 'Win Rate',
    value: '73.2%',
    subValue: '8 trades today',
    change: '6W · 2L',
    changeUp: true,
    icon: <BarChart2 size={18} />,
    iconColor: 'text-primary bg-primary/15',
  },
]

export function StatsCards() {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardHeader>
            <CardTitle>{stat.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p
                  className={cn(
                    'text-2xl font-bold tracking-tight',
                    stat.title === 'Day P&L'
                      ? 'text-success'
                      : 'text-foreground',
                  )}
                >
                  {stat.value}
                </p>
                {stat.subValue && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.subValue}
                  </p>
                )}
                {stat.change && (
                  <div
                    className={cn(
                      'flex items-center gap-0.5 mt-2 text-xs font-medium',
                      stat.changeUp ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {stat.changeUp ? (
                      <ArrowUpRight size={12} />
                    ) : (
                      <ArrowDownRight size={12} />
                    )}
                    {stat.change}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-lg',
                  stat.iconColor,
                )}
              >
                {stat.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
