import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { Candle } from '@/lib/types'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export function SimpleChartWidget({ candles }: { candles: Candle[] }) {
  const chartData = useMemo(() => {
    // Only take the last 60 candles to keep it clean, or all if preferred.
    // The user wants a simple chart of the Upstox data.
    const slice = candles.slice(-120) // Last 2 hours of 1-minute candles
    return slice.map((c) => {
      const date = new Date(c[0])
      return {
        time: date.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        price: c[4], // Close price
      }
    })
  }, [candles])

  if (candles.length === 0) {
    return (
      <Card className="overflow-hidden border-border/40 bg-card/40 flex flex-col h-full min-h-[200px]">
        <CardContent className="p-0 flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Waiting for chart data...
        </CardContent>
      </Card>
    )
  }

  // Calculate domain for Y axis to make the chart look nice
  const minPrice = Math.min(...chartData.map((d) => d.price))
  const maxPrice = Math.max(...chartData.map((d) => d.price))
  // Add some padding
  const padding = (maxPrice - minPrice) * 0.1
  const domain = [Math.floor(minPrice - padding), Math.ceil(maxPrice + padding)]

  return (
    <Card className="overflow-hidden border-border/40 bg-card/40 flex flex-col h-full min-h-[200px] relative">
      <div className="absolute top-3 left-3 z-10 flex flex-col">
        <span className="text-xs font-semibold">NIFTY 50</span>
        <span className="text-[10px] text-muted-foreground">
          Upstox 1-min Data
        </span>
      </div>
      <CardContent className="p-0 flex-1 pt-10 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22ab94" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22ab94" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 10, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              orientation="right"
              tickFormatter={(val: number) => val.toLocaleString('en-IN')}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '6px',
                fontSize: '12px',
              }}
              itemStyle={{ color: '#22ab94' }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#22ab94"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPrice)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
