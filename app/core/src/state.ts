// IN DEVELOPMENT
export const tradeState = () => {
    let STATE =  'STARTED';
    let PENDING_TRADE_PER_DAY = 0;

    return {
        updateState:  (newState:  'STARTED' | 'STOPPED' | 'IN-ORDER') => STATE = newState,
        state:  () => STATE,
        updatePendingTrades: (pendingTrades: number) => PENDING_TRADE_PER_DAY = pendingTrades,
        pendingTrades: () => PENDING_TRADE_PER_DAY,
    }
}
