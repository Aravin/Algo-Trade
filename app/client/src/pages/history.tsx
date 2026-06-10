import { useEffect, useState } from 'react'
import { Clock3, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchPaperAccount, type PaperAccountSummary } from '@/lib/paperTrading'

function fmtCurrency(value: number) {
  return value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  })
}

export function HistoryPage() {
  const [data, setData] = useState<PaperAccountSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchPaperAccount()
      .then((summary) => {
        if (!cancelled) {
          setData(summary)
          setError('')
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-5 p-6 min-w-0">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Trade History
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Paper trading ledger and simulated trade statement
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-2xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet size={14} className="text-primary" />
              Paper Credit
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {data ? fmtCurrency(data.account.balance) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Open simulated trades: {data?.openTradeCount ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock3 size={14} className="text-primary" />
              Recent Statement
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.recentEntries ?? []).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {entry.entry_type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-xs font-mono ${entry.amount >= 0 ? 'text-success' : 'text-destructive'}`}
                    >
                      {entry.amount >= 0 ? '+' : ''}
                      {fmtCurrency(entry.amount)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {fmtCurrency(entry.balance_after)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.note ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
