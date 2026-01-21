import { AssetType, calculatePnL, OpenOrders, OrderType, UserState, type OpenOrdersDetails } from "./route/order";

const LIQUIDATION_THRESHOLD = 0.90; // Liquidate when 90% of margin is lost

interface PriceData {
    bid: number;
    ask: number;
    price: number;
}

// Liquidate position - user gets NOTHING
function liquidatePosition(orderId: string, price: number) {
    const orderIndex = OpenOrders.findIndex(x => x.orderId === orderId);
    if (orderIndex === -1) return;

    const order = OpenOrders[orderIndex];
    if(!order){
        return
    }
    const user = UserState.find(x => x.userId === order.userId);
    if (!user) return;

    const pnl = calculatePnL(order, price);
    
    user.totalPnL += pnl;
    
    OpenOrders.splice(orderIndex, 1);
    
    console.log(`🚨 LIQUIDATED: ${order.type} ${order.asset} | Lost: $${order.margin.toFixed(2)}`);
}

// Close position normally
function closePosition(orderId: string, price: number, reason: string) {
    const orderIndex = OpenOrders.findIndex(x => x.orderId === orderId);
    if (orderIndex === -1) return;

    const order = OpenOrders[orderIndex];
    if(!order){
        return
    }
    const user = UserState.find(x => x.userId === order.userId);
    if (!user) return;

    const pnl = calculatePnL(order, price);
    
    // ✅ Return margin + PnL
    user.balance.usd += order.margin + pnl;
    user.totalPnL += pnl;

    OpenOrders.splice(orderIndex, 1);
    
    console.log(`📊 ${reason}: ${order.type} ${order.asset} | P&L: $${pnl.toFixed(2)}`);
}

// Check position updates
function checkPositionUpdates(asset: AssetType, priceData: PriceData) {
    const assetOrders = OpenOrders.filter(x => x.asset === asset);
    
    assetOrders.forEach(order => {
        // Use bid for LONG (exit by selling), ask for SHORT (exit by buying)
        const currentPrice = order.type === OrderType.LONG ? priceData.bid : priceData.ask;
        const pnl = calculatePnL(order, currentPrice);
        
        // 1. CHECK LIQUIDATION
        const marginLoss = Math.max(0, -pnl);
        const marginLossRatio = marginLoss / order.margin;
        
        if (marginLossRatio >= LIQUIDATION_THRESHOLD) {
            liquidatePosition(order.orderId, currentPrice);
            return;
        }
        
        // 2. CHECK STOP LOSS
        if (order.stoploss !== undefined) {
            const hitStopLoss = 
                (order.type === OrderType.LONG && priceData.bid <= order.stoploss) || 
                (order.type === OrderType.SHORT && priceData.ask >= order.stoploss);
            
            if (hitStopLoss) {
                closePosition(order.orderId, currentPrice, "STOP LOSS");
                return;
            }
        }
        
        // 3. CHECK TAKE PROFIT
        if (order.takeprofit !== undefined) {
            const hitTakeProfit = 
                (order.type === OrderType.LONG && priceData.ask >= order.takeprofit) || 
                (order.type === OrderType.SHORT && priceData.bid <= order.takeprofit);
            
            if (hitTakeProfit) {
                closePosition(order.orderId, currentPrice, "TAKE PROFIT");
                return;
            }
        }
    });
}

export { checkPositionUpdates, closePosition, liquidatePosition };