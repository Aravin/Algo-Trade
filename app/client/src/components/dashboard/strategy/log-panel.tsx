import { useEffect, useRef, useState } from 'react'
import { Terminal, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { BotLog } from '@/hooks/useStrategyBot'

const LEVEL_STYLE: Record<BotLog['level'], string> = {
  info: 'text-foreground',
  debug: 'text-muted-foreground/60',
  warn: 'text-warning',
  error: 'text-destructive',
}
const LEVEL_PREFIX: Record<BotLog['level'], string> = {
  info: 'INFO ',
  debug: 'DBG  ',
  warn: 'WARN ',
  error: 'ERR  ',
}

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function LogPanel({
  logs,
  onClear,
}: {
  logs: BotLog[]
  onClear: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter] = useState<BotLog['level'] | 'all'>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  const visible = (
    filter === 'all' ? logs : logs.filter((l) => l.level === filter)
  )
    .slice()
    .reverse()
  const errorCount = logs.filter((l) => l.level === 'error').length
  const warnCount = logs.filter((l) => l.level === 'warn').length

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [logs.length, collapsed])

  return (
    <Card>
      <CardHeader className="sticky top-0 z-10 border-b border-border/40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <CardTitle className="text-sm flex items-center gap-2">
          <Terminal size={14} className="text-primary" />
          Bot Logs
          {errorCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-destructive/20 text-destructive px-2 py-0.5 text-xs font-medium">
              {errorCount} err
            </span>
          )}
          {warnCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-warning/20 text-warning px-2 py-0.5 text-xs font-medium">
              {warnCount} warn
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {/* Filter buttons */}
            {(['all', 'info', 'warn', 'error', 'debug'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${filter === lvl ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {lvl}
              </button>
            ))}
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onClear}
              title="Clear logs"
            >
              <Trash2 size={12} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0">
          <div
            ref={scrollRef}
            className="app-scrollbar h-48 overflow-y-auto rounded-md border border-border/40 bg-muted/30 p-2 font-mono text-xs space-y-0.5"
          >
            {visible.length === 0 ? (
              <p className="text-muted-foreground/50 text-center py-6">
                No logs yet
              </p>
            ) : (
              visible.map((l) => (
                <div key={l.id} className="flex gap-2 leading-5">
                  <span className="text-muted-foreground/50 shrink-0 tabular-nums">
                    {fmt(l.ts)}
                  </span>
                  <span className={`shrink-0 ${LEVEL_STYLE[l.level]}`}>
                    {LEVEL_PREFIX[l.level]}
                  </span>
                  <span className="text-primary/70 shrink-0">[{l.source}]</span>
                  <span className={LEVEL_STYLE[l.level]}>{l.msg}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
