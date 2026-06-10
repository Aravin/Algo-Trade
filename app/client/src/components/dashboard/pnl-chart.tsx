import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const pnlData = [
  { time: '9:15', pnl: 0 },
  { time: '9:30', pnl: 420 },
  { time: '9:45', pnl: 810 },
  { time: '10:00', pnl: 1150 },
  { time: '10:15', pnl: 940 },
  { time: '10:30', pnl: 1380 },
  { time: '10:45', pnl: 2050 },
  { time: '11:00', pnl: 2340 },
  { time: '11:15', pnl: 1980 },
  { time: '11:30', pnl: 2720 },
  { time: '11:45', pnl: 3150 },
  { time: '12:00', pnl: 3020 },
  { time: '12:15', pnl: 3480 },
  { time: '12:30', pnl: 3860 },
  { time: '12:45', pnl: 4210 },
  { time: '13:00', pnl: 3940 },
  { time: '13:15', pnl: 4580 },
  { time: '13:30', pnl: 5230 },
  { time: '13:45', pnl: 5840 },
  { time: '14:00', pnl: 6380 },
  { time: '14:15', pnl: 5990 },
  { time: '14:30', pnl: 7120 },
  { time: '14:45', pnl: 8040 },
  { time: '15:00', pnl: 9160 },
  { time: '15:15', pnl: 10830 },
  { time: '15:20', pnl: 12450 },
]

interface TooltipPayload {
  value: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload?.length) {
    const value = payload[0].value
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
        <p className="text-muted-foreground mb-1">{label}</p>
        <p
          className={`font-semibold ${value >= 0 ? 'text-success' : 'text-destructive'}`}
        >
          {value >= 0 ? '+' : ''}₹{value.toLocaleString('en-IN')}
        </p>
      </div>
    )
  }
  return null
}

export function PnLChart() {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Intraday P&amp;L</CardTitle>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-success">+₹12,450</span>
            <span className="text-xs text-muted-foreground ml-1">today</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={pnlData}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="oklch(0.67 0.18 145)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="oklch(0.67 0.18 145)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.25 0.015 260 / 60%)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'oklch(0.56 0.01 260)' }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'oklch(0.56 0.01 260)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="oklch(0.67 0.18 145)"
              strokeWidth={2}
              fill="url(#pnlGradient)"
              dot={false}
              activeDot={{ r: 4, fill: 'oklch(0.67 0.18 145)', stroke: 'none' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
