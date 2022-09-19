export const buySellSignal
    = (momentum: string, trend: string, volatility: string, currentState: string, orderType: string): AllOrders | HoldOrExit | '' => {
    const orderState = buySellMatrix.find((v) => {
        v.buy_order === momentum && v.trend_macd === trend && v.volatility_atr === volatility
    });

    if (!orderState)
        return '';
    if (currentState === 'START')
        return orderState?.no_order;
    else if (currentState === 'ORDERED')
        if (orderType === 'CE')
            return orderState?.buy_order;
        else
            return orderState?.sell_order;
    else
        return '';
}

type AllOrders = 'none' | 'buy' | 'hold' | 'exit';
type BuySellNeutral = 'buy' | 'sell' | 'neutral';
type HoldOrExit = 'hold' | 'exit';

interface BuySellMatrix {
    momentum_rsi: BuySellNeutral,
    trend_macd: BuySellNeutral,
    volatility_atr: 'high' | 'low',
    no_order: AllOrders,
    buy_order: HoldOrExit,
    sell_order: HoldOrExit,
}

const buySellMatrix: BuySellMatrix[] = [
    {
        "momentum_rsi": "buy",
        "trend_macd": "buy",
        "volatility_atr": "high",
        "no_order": "buy",
        "buy_order": "hold",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "sell",
        "trend_macd": "buy",
        "volatility_atr": "high",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "neutral",
        "trend_macd": "buy",
        "volatility_atr": "high",
        "no_order": "none",
        "buy_order": "hold",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "buy",
        "trend_macd": "sell",
        "volatility_atr": "high",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "sell",
        "trend_macd": "sell",
        "volatility_atr": "high",
        "no_order": "buy",
        "buy_order": "exit",
        "sell_order": "hold"
    },
    {
        "momentum_rsi": "neutral",
        "trend_macd": "sell",
        "volatility_atr": "high",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "hold"
    },
    {
        "momentum_rsi": "buy",
        "trend_macd": "neutral",
        "volatility_atr": "high",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "sell",
        "trend_macd": "neutral",
        "volatility_atr": "high",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "neutral",
        "trend_macd": "neutral",
        "volatility_atr": "high",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "buy",
        "trend_macd": "buy",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "hold",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "sell",
        "trend_macd": "buy",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "neutral",
        "trend_macd": "buy",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "buy",
        "trend_macd": "sell",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "sell",
        "trend_macd": "sell",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "hold"
    },
    {
        "momentum_rsi": "neutral",
        "trend_macd": "sell",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "buy",
        "trend_macd": "neutral",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "sell",
        "trend_macd": "neutral",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    },
    {
        "momentum_rsi": "neutral",
        "trend_macd": "neutral",
        "volatility_atr": "low",
        "no_order": "none",
        "buy_order": "exit",
        "sell_order": "exit"
    }
];
