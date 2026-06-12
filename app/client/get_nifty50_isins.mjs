const NIFTY50_SYMBOLS = [
  'ADANIENT',
  'ADANIPORTS',
  'APOLLOHOSP',
  'ASIANPAINT',
  'AXISBANK',
  'BAJAJ-AUTO',
  'BAJFINANCE',
  'BAJAJFINSV',
  'BPCL',
  'BHARTIARTL',
  'BRITANNIA',
  'CIPLA',
  'COALINDIA',
  'DIVISLAB',
  'DRREDDY',
  'EICHERMOT',
  'GRASIM',
  'HCLTECH',
  'HDFCBANK',
  'HDFCLIFE',
  'HEROMOTOCO',
  'HINDALCO',
  'HINDUNILVR',
  'ICICIBANK',
  'INDUSINDBK',
  'INFY',
  'ITC',
  'JSWSTEEL',
  'KOTAKBANK',
  'LT',
  'LTIM',
  'M&M',
  'MARUTI',
  'NESTLEIND',
  'NTPC',
  'ONGC',
  'POWERGRID',
  'RELIANCE',
  'SBILIFE',
  'SHRIRAMFIN',
  'SBIN',
  'SUNPHARMA',
  'TCS',
  'TATACONSUM',
  'TATAMOTORS',
  'TATASTEEL',
  'TECHM',
  'TITAN',
  'TRENT',
  'ULTRACEMCO',
]

import fs from 'fs'
import zlib from 'zlib'

const data = zlib.gunzipSync(fs.readFileSync('NSE.csv.gz')).toString('utf8')
const lines = data.split('\n')

const mapped = []

for (const symbol of NIFTY50_SYMBOLS) {
  const line = lines.find((l) => {
    const cols = l.split(',')
    if (cols.length > 2) {
      if (
        cols[2].replace(/"/g, '') === symbol &&
        cols[9].replace(/"/g, '') === 'EQUITY' &&
        cols[11].replace(/"/g, '').trim() === 'NSE_EQ'
      ) {
        return true
      }
    }
    return false
  })
  if (line) {
    mapped.push(line.split(',')[0].replace(/"/g, ''))
  } else {
    console.log('NOT FOUND', symbol)
  }
}

console.log('const NIFTY50_KEYS = [')
for (const key of mapped) {
  console.log(`  '${key}',`)
}
console.log('];')
