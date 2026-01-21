import { AssetType, calculatepnl, OpenOrders, type, UserState, type OpenOrdersDetails } from "./route/order";

const LIQUIDATION_THRESHOLD = 0.90; // Changed to 0.90 (liquidate when 90% lost)

interface PriceData {
    bid: number;
    ask: number;
    price: number;
}

// Close position
function closeposition(orderId: string, price: number) {
    const openorder = OpenOrders.findIndex(x => x.orderId === orderId);
    if (openorder === -1) return;

    const orderdetails = OpenOrders[openorder];
    if (!orderdetails) return;

    const user = UserState.find(x => x.userId === orderdetails?.userId);
    if (!user) return;

    const pnl = calculatepnl(orderdetails, price);
    
    // For margin trades: return margin + PnL
    // For non-margin: return position value + PnL
    const positionValue = orderdetails.price * orderdetails.qty;
    const margin = orderdetails.margin || positionValue;
    
    const amountToReturn = Math.max(0, margin + pnl);
    user.balance.usd += amountToReturn;

    OpenOrders.splice(openorder, 1);
}

// Check position updates with bid/ask
function checkpositionupdates(asset: AssetType, priceData: PriceData) {
    const AssetOpenOrders = OpenOrders.filter(x => x.asset == asset);
    
    AssetOpenOrders.forEach(x => {
        const pnl = calculatepnl(x, priceData.price);
        const margin_value = x.margin || 0;
        
        // Skip non-margin trades for liquidation
        if (margin_value <= 0) {
            // Check only stop loss/take profit for non-margin
            if (x.stoploss) {
                const hitstoploss = (x.type === type.LONG && priceData.bid <= x.stoploss) || 
                                   (x.type === type.SHORT && priceData.ask >= x.stoploss);
                if (hitstoploss) {
                    const closePrice = x.type === type.LONG ? priceData.bid : priceData.ask;
                    closeposition(x.orderId, closePrice);
                    return;
                }
            }
            
            if (x.takeprofit) {
                const hittakeprofit = (x.type === type.LONG && priceData.ask >= x.takeprofit) || 
                                     (x.type === type.SHORT && priceData.bid <= x.takeprofit);
                if (hittakeprofit) {
                    const closePrice = x.type === type.LONG ? priceData.ask : priceData.bid;
                    closeposition(x.orderId, closePrice,);
                    return;
                }
            }
            return;
        }
        
        // For margin trades: check liquidation
        const marginLost = Math.max(0, -pnl) / margin_value;
        
        if (marginLost >= LIQUIDATION_THRESHOLD) {
            const closePrice = x.type === type.LONG ? priceData.bid : priceData.ask;
            closeposition(x.orderId, closePrice,);
            return;
        }
        
        // Check stop loss for margin trades
        if (x.stoploss) {
            const hitstoploss = (x.type === type.LONG && priceData.bid <= x.stoploss) || 
                               (x.type === type.SHORT && priceData.ask >= x.stoploss);
            if (hitstoploss) {
                const closePrice = x.type === type.LONG ? priceData.bid : priceData.ask;
                closeposition(x.orderId, closePrice,);
                return;
            }
        }
        
        // Check take profit for margin trades
        if (x.takeprofit) {
            const hittakeprofit = (x.type === type.LONG && priceData.ask >= x.takeprofit) || 
                                 (x.type === type.SHORT && priceData.bid <= x.takeprofit);
            if (hittakeprofit) {
                const closePrice = x.type === type.LONG ? priceData.ask : priceData.bid;
                closeposition(x.orderId, closePrice);
                return;
            }
        }
    });
}

export { checkpositionupdates };