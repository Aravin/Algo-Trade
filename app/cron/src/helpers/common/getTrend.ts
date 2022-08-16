
// can be removed in future
// may core changes required
export const getTrend = (action: string) => {
    if (action.toLowerCase().includes('sell')) {
        return 'negative';
    }
    else if (action.toLowerCase().includes('buy')) {
        return 'positive';
    }
    else {
        return 'neutral'
    }
}