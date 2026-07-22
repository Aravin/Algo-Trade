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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { getLotSizeForSymbol } from '@/utils/tradeUtils'

interface Trade {
  id: string
  symbol: string
  displaySymbol?: string
  type: 'CE' | 'PE' | 'EQ' | 'FUT'
  side: 'BUY' | 'SELL'
  qty: number
  entryPrice: number
  ltp: number
  pnl: number
  pnlPct: number
  status: 'ACTIVE' | 'CLOSED' | 'SL_HIT' | 'TARGET_HIT'
  entryTime: string
}

const activeTrades: Trade[] = [
  {
    id: '1',
    symbol: 'NIFTY 25000 CE',
    type: 'CE',
    side: 'BUY',
    qty: 50,
    entryPrice: 185.5,
    ltp: 220.35,
    pnl: 1742,
    pnlPct: 18.78,
    status: 'ACTIVE',
    entryTime: '09:18',
  },
  {
    id: '2',
    symbol: 'BANKNIFTY 52000 PE',
    type: 'PE',
    side: 'BUY',
    qty: 25,
    entryPrice: 310.0,
    ltp: 285.75,
    pnl: -606,
    pnlPct: -7.82,
    status: 'ACTIVE',
    entryTime: '10:05',
  },
  {
    id: '3',
    symbol: 'RELIANCE',
    type: 'EQ',
    side: 'BUY',
    qty: 10,
    entryPrice: 2845.0,
    ltp: 2892.4,
    pnl: 474,
    pnlPct: 1.67,
    status: 'ACTIVE',
    entryTime: '11:32',
  },
  {
    id: '4',
    symbol: 'NIFTY 25100 CE',
    type: 'CE',
    side: 'BUY',
    qty: 50,
    entryPrice: 165.2,
    ltp: 198.8,
    pnl: 1680,
    pnlPct: 20.34,
    status: 'ACTIVE',
    entryTime: '12:14',
  },
]

const closedTrades: Trade[] = [
  {
    id: '5',
    symbol: 'NIFTY 24900 PE',
    type: 'PE',
    side: 'BUY',
    qty: 50,
    entryPrice: 95.0,
    ltp: 142.5,
    pnl: 2375,
    pnlPct: 50.0,
    status: 'TARGET_HIT',
    entryTime: '09:15',
  },
  {
    id: '6',
    symbol: 'BANKNIFTY 51500 CE',
    type: 'CE',
    side: 'BUY',
    qty: 25,
    entryPrice: 180.0,
    ltp: 155.0,
    pnl: -625,
    pnlPct: -13.89,
    status: 'SL_HIT',
    entryTime: '09:22',
  },
  {
    id: '7',
    symbol: 'TCS',
    type: 'EQ',
    side: 'BUY',
    qty: 10,
    entryPrice: 3540.0,
    ltp: 3560.0,
    pnl: 200,
    pnlPct: 0.56,
    status: 'CLOSED',
    entryTime: '10:45',
  },
  {
    id: '8',
    symbol: 'INFY',
    type: 'EQ',
    side: 'BUY',
    qty: 20,
    entryPrice: 1620.0,
    ltp: 1638.0,
    pnl: 360,
    pnlPct: 1.11,
    status: 'CLOSED',
    entryTime: '11:00',
  },
]

const typeVariant: Record<
  string,
  'default' | 'destructive' | 'success' | 'secondary' | 'warning' | 'outline'
> = {
  CE: 'default',
  PE: 'destructive',
  EQ: 'secondary',
  FUT: 'warning',
}

const statusVariant: Record<
  string,
  'default' | 'destructive' | 'success' | 'secondary' | 'warning' | 'outline'
> = {
  ACTIVE: 'default',
  CLOSED: 'secondary',
  SL_HIT: 'destructive',
  TARGET_HIT: 'success',
}

const statusLabel: Record<string, string> = {
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  SL_HIT: 'SL Hit',
  TARGET_HIT: 'Target',
}

function TradesTable({ trades }: { trades: Trade[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">LTP</TableHead>
          <TableHead className="text-right">P&amp;L</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((trade) => (
          <TableRow key={trade.id}>
            <TableCell>
              <div>
                <p className="font-medium text-sm">{trade.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  {trade.side} · {trade.entryTime}
                </p>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={typeVariant[trade.type]}>{trade.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              <div>
                <span>{trade.qty}</span>
                {(() => {
                  const lotSize = getLotSizeForSymbol(
                    trade.displaySymbol ?? trade.symbol,
                  )
                  if (lotSize > 1 && trade.type !== 'EQ') {
                    const lots = Math.round(trade.qty / lotSize)
                    return (
                      <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                        ({lots} {lots > 1 ? 'lots' : 'lot'})
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              ₹
              {trade.entryPrice.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
              })}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              ₹{trade.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </TableCell>
            <TableCell className="text-right">
              <div>
                <p
                  className={cn(
                    'font-mono text-sm font-medium',
                    trade.pnl >= 0 ? 'text-success' : 'text-destructive',
                  )}
                >
                  {trade.pnl >= 0 ? '+' : ''}₹
                  {Math.abs(trade.pnl).toLocaleString('en-IN')}
                </p>
                <p
                  className={cn(
                    'text-xs',
                    trade.pnl >= 0 ? 'text-success/70' : 'text-destructive/70',
                  )}
                >
                  {trade.pnlPct >= 0 ? '+' : ''}
                  {trade.pnlPct.toFixed(2)}%
                </p>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <Badge variant={statusVariant[trade.status]}>
                {statusLabel[trade.status]}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ActiveTrades() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Trades</CardTitle>
          <span className="text-xs text-muted-foreground">8 today</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-0">
        <Tabs defaultValue="active">
          <div className="px-5 mb-2">
            <TabsList>
              <TabsTrigger value="active">
                Open{' '}
                <span className="ml-1.5 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                  4
                </span>
              </TabsTrigger>
              <TabsTrigger value="closed">
                Closed{' '}
                <span className="ml-1.5 text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full">
                  4
                </span>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="active" className="mt-0">
            <TradesTable trades={activeTrades} />
          </TabsContent>
          <TabsContent value="closed" className="mt-0">
            <TradesTable trades={closedTrades} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
