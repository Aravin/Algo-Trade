import { appConfig } from "./../config/app";

export const appState = () => {
    let STATE =  'START';
    let PENDING_TRADE_PER_DAY = 0;

    return {
        updateState:  (newState:  'STARTED' | 'STOPPED' | 'IN-ORDER') => STATE = newState,
        state:  () => STATE,
        updatePendingOrder: (pendingTrades: number) => PENDING_TRADE_PER_DAY = pendingTrades,
        pendingTrades: () => PENDING_TRADE_PER_DAY,
    }
}
