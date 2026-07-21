import { useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => void
    }
  }
}

export function TradingViewWidget() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const initWidget = () => {
      if (!containerRef.current) return
      if (typeof window !== 'undefined' && window.TradingView) {
        new window.TradingView.widget({
          autosize: true,
          symbol: 'NSE:NIFTY',
          interval: '1',
          timezone: 'Asia/Kolkata',
          theme: 'dark',
          style: '1', // 1 is Candles
          locale: 'in',
          enable_publishing: false,
          backgroundColor: 'transparent',
          gridColor: 'rgba(255, 255, 255, 0.06)',
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: containerRef.current.id,
        })
      }
    }

    const existingScript = document.getElementById('tv-widget-script')
    if (!existingScript) {
      const script = document.createElement('script')
      script.id = 'tv-widget-script'
      script.src = 'https://s3.tradingview.com/tv.js'
      script.async = true
      script.onload = initWidget
      document.head.appendChild(script)
    } else {
      initWidget()
    }

    return () => {
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [])

  return (
    <Card className="overflow-hidden border-border/40 bg-card/40">
      <CardContent className="p-0 h-[400px]">
        <div
          id="tradingview_nifty_chart"
          ref={containerRef}
          className="h-full w-full"
        />
      </CardContent>
    </Card>
  )
}
