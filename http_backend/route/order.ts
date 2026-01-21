import { Router, type Request, type Response } from "express"
import { createClient } from "redis";
const router = Router();

// Add PriceData interface
interface PriceData {
    bid: number;
    ask: number;
    price: number;
}

export interface UserDetails {
    userId: string,
    username: string,
    password: string,
    balance: {
        usd: number,
    }
}

export interface OpenOrdersDetails {
    orderId: string
    userId: string
    type: type
    asset: AssetType
    price: number
    qty: number
    ismargin?: boolean
    margin?: number
    leverage?: number
    stoploss?: number
    takeprofit?: number
}

export enum AssetType {
    BTC_USDC = "BTC_USDC",
    SOL_USDC = "SOL_USDC",
    ETH_USDC = "ETH_USDC"
}

export enum type {
    LONG = 'LONG',
    SHORT = 'SHORT'
}

const redis = createClient();
redis.connect();

// Import liquidation function
import { checkpositionupdates } from "../helper";

// Store current prices
let currentPrices: Record<AssetType, PriceData> = {
    [AssetType.BTC_USDC]: { bid: 0, ask: 0, price: 0 },
    [AssetType.ETH_USDC]: { bid: 0, ask: 0, price: 0 },
    [AssetType.SOL_USDC]: { bid: 0, ask: 0, price: 0 }
};

// Update Redis subscriptions
redis.subscribe("SOL_USDC", (message) => {
    try {
        const priceData: PriceData = JSON.parse(message);
        currentPrices[AssetType.SOL_USDC] = priceData;
        checkpositionupdates(AssetType.SOL_USDC, priceData);
    } catch (error) {
        console.error("Error parsing SOL_USDC:", error);
    }
});

redis.subscribe("ETH_USDC", (message) => {
    try {
        const priceData: PriceData = JSON.parse(message);
        currentPrices[AssetType.ETH_USDC] = priceData;
        checkpositionupdates(AssetType.ETH_USDC, priceData);
    } catch (error) {
        console.error("Error parsing ETH_USDC:", error);
    }
});

redis.subscribe("BTC_USDC", (message) => {
    try {
        const priceData: PriceData = JSON.parse(message);
        currentPrices[AssetType.BTC_USDC] = priceData;
        checkpositionupdates(AssetType.BTC_USDC, priceData);
    } catch (error) {
        console.error("Error parsing BTC_USDC:", error);
    }
});

export let UserState: UserDetails[] = [];
export let OpenOrders: OpenOrdersDetails[] = [];

// Signup
router.post("/singup", (req: Request, res: Response) => {
    const { username, password, id } = req.body;
    const user = {
        userId: id,
        username,
        password,
        balance: {
            usd: 50000,
        }
    }
    UserState.push(user);
    return res.status(200).json({
        msg: "successfully updated"
    })
})

// Create order
router.post("/create/order", (req: Request, res: Response) => {
    const { userId, type, asset, price, margin, qty, leverage, stoploss, takeprofit } = req.body;
    
    const user = UserState.find(u => u.userId === userId);
    if (!user) {
        return res.status(404).json({
            msg: 'invalid user'
        })
    }
    
    // Get current price data
    const priceData = getcurrentprice(asset as AssetType);
    const currentprice = priceData.price;
    
    const positionvalue = currentprice * qty;
    
    // Check if margin trade
    const isMarginTrade = !!margin || !!leverage;
    let requiredMargin = 0;
    
    if (isMarginTrade) {
        // Margin trade
        requiredMargin = margin || (positionvalue / (leverage || 1));
        if (user.balance.usd < requiredMargin) {
            return res.json({
                msg: "insufficient margin",
                required: requiredMargin,
                available: user.balance.usd
            })
        }
        user.balance.usd -= requiredMargin;
    } else {
        // Non-margin trade (full payment)
        if (user.balance.usd < positionvalue) {
            return res.json({
                msg: "insufficient balance",
                required: positionvalue,
                available: user.balance.usd
            })
        }
        user.balance.usd -= positionvalue;
        requiredMargin = positionvalue; // For non-margin, margin = position value
    }
    
    const orderId = getRandomOrderId();
    const order: OpenOrdersDetails = {
        orderId,
        userId,
        type: type as type,
        asset: asset as AssetType,
        price: currentprice,
        qty,
        ismargin: isMarginTrade,
        margin: requiredMargin,
        leverage,
        stoploss,
        takeprofit
    }
    
    OpenOrders.push(order);
    
    return res.status(200).json({
        msg: "order created successfully",
        orderId: orderId,
        isMarginTrade,
        margin: requiredMargin,
        leverage: leverage || 1
    })
})

// Close order
router.post("/delete/order/:orderId", (req: Request, res: Response) => {
    const { orderId } = req.params;
    const orderIndex = OpenOrders.findIndex(x => x.orderId == orderId);
    
    if (orderIndex === -1) {
        return res.status(404).json({
            msg: "order not found"
        })
    }
    
    const order = OpenOrders[orderIndex];
    if (!order) {
        return res.status(404).json({
            msg: "order not found"
        })
    }
    
    const user = UserState.find(x => x.userId === order.userId);
    if (!user) {
        return res.status(404).json({
            msg: "user not found"
        })
    }
    
    const priceData = getcurrentprice(order.asset);
    const currentprice = priceData.price;
    const pnl = calculatepnl(order, currentprice);
    
    // Calculate return amount
    if (order.ismargin && order.margin) {
        // Margin trade: return margin + PnL
        const amountToReturn = Math.max(0, order.margin + pnl);
        user.balance.usd += amountToReturn;
    } else {
        // Non-margin trade: return position value + PnL
        const positionvalue = order.price * order.qty;
        user.balance.usd += positionvalue + pnl;
    }
    
    OpenOrders.splice(orderIndex, 1);
    
    return res.status(200).json({
        msg: "position closed successfully",
        pnl: pnl,
        newBalance: user.balance.usd
    })
})

// Get balance
router.get("/balance/:userId", (req: Request, res: Response) => {
    const { userId } = req.params;

    const user = UserState.find(x => x.userId === userId);
    if (!user) {
        return res.status(400).json({
            msg: "user not found"
        })
    }

    const userpositions = OpenOrders.filter(x => x.userId === user.userId);
    let totalunrealizedpnl = 0;
    let lockedmargin = 0;

    userpositions.forEach(x => {
        const priceData = getcurrentprice(x.asset);
        const currentprice = priceData.price;
        const pnl = calculatepnl(x, currentprice);
        totalunrealizedpnl += pnl;
        
        // For margin trades, locked margin is the margin amount
        // For non-margin trades, locked margin is position value
        if (x.ismargin && x.margin) {
            lockedmargin += x.margin;
        } else {
            lockedmargin += x.price * x.qty;
        }
    })

    return res.status(200).json({
        balance: {
            available: user.balance.usd,
            locked: lockedmargin,
            unrealizedPnL: totalunrealizedpnl,
            total: user.balance.usd + lockedmargin + totalunrealizedpnl
        },
        openPositions: userpositions.length
    })
})

function getRandomOrderId() {
    return Math.random().toString()
}

export function calculatepnl(position: OpenOrdersDetails, currentprice: number): number {
    if (position.type === type.LONG) {
        return (currentprice - position.price) * position.qty;
    } else {
        return (position.price - currentprice) * position.qty;
    }
}

// Updated to return PriceData
function getcurrentprice(asset: AssetType): PriceData {
    return currentPrices[asset] || { bid: 0, ask: 0, price: 1000 };
}

export default router;