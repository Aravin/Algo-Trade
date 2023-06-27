# Algo Trade

NIFTY50 Option Trading based on Global sentiment and well-known technical indicators.

![Basic Flow Diagram](https://github.com/Aravin/Algo-Trade/raw/main/assets/images/basic-flow-diagram.png)

## V1

- Scrap Investing.com and get global indicies trend
- Scrap Investing.com and get last 5 min trend & 1 min trend to get sentiment & direction
- Use technical indicator ATR, RSI, HL
- If everything goes good, place order (via finvasia)
- Exit the order if profit or loss hit (configurable %)

## V2

- Scrap Investing.com and get global indicies trend
- Scrap Investing.com and get last 1 min trend to get sentiment & direction
- Use technical indicator RSI, MACD, ATR
- If everything goes good, place order (via finvasia)
- Exit the order if profit or loss hit (configurable %)

## V3

- Fetch global sentiment from moneycontrol.com
- Fetch nifty50 sentiment from nseindia.com - AD Ratio
- place order (via upstox)
- exit if profit or loss hit

## Global Sentiments

1. Dow Jones
2. Nikkei 225
3. Hang Seng
4. Shanghai
5. FTSE 100
6. KOSPI 50
7. CAC 40
8. SGX NIFTY

- Brent Oil
- USD/INR

## Technical Indicators

1. Pivot Points
2. Moving Averages
3. RSI
4. MACD

## No. of Trades

- Configurable

## Profit Percentage

- Configurable

## How to Access?

- API
- Website

## Supported Brokers

- Finvasia
- Upstox

## Important Links

- To get NIFTY50 data nseindia.com/api/equity-stockIndices?index=NIFTY%2050
- To get Global data

## Contact / Issue / Feedback

- <https://github.com/Aravin/Algo-Trade/issues>


## Trade Logs (store in AWS)

![Basic Flow Diagram](https://github.com/Aravin/Algo-Trade/raw/main/assets/images/trade-log.png)

