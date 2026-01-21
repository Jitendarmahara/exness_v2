import { Router, type Request, type Response } from "express";
import { createClient } from "redis";

const router = Router();

// Price Data interface
interface PriceData {
    bid: number;
    ask: number;
    price: number;
}

export interface UserDetails {
    userId: string;
    username: string;
    password: string;
    balance: {
        usd: number;
    };
    totalPnL: number;
}

export interface OpenOrdersDetails {
    orderId: string;
    userId: string;
    type: OrderType;
    asset: AssetType;
    entryPrice: number; // Changed from 'price'
    quantity: number; // Changed from 'qty'
    margin: number; // Always required
    leverage: number; // Always required
    stoploss?: number;
    takeprofit?: number;
    timestamp: number;
}

export enum AssetType {
    BTC_USDC = "BTC_USDC",
    SOL_USDC = "SOL_USDC",
    ETH_USDC = "ETH_USDC"
}

export enum OrderType {
    LONG = 'LONG',
    SHORT = 'SHORT'
}

const ALLOWED_LEVERAGE = [1, 2, 5, 10, 25, 50, 100, 200, 500];

// Redis connection
const redis = createClient();
redis.connect();

// Import liquidation function
import { checkPositionUpdates } from "../helper";

// Store current prices
let currentPrices: Record<AssetType, PriceData> = {
    [AssetType.BTC_USDC]: { bid: 0, ask: 0, price: 0 },
    [AssetType.ETH_USDC]: { bid: 0, ask: 0, price: 0 },
    [AssetType.SOL_USDC]: { bid: 0, ask: 0, price: 0 }
};

// Redis subscriptions
redis.subscribe("SOL_USDC", (message) => {
    try {
        const priceData: PriceData = JSON.parse(message);
        currentPrices[AssetType.SOL_USDC] = priceData;
        checkPositionUpdates(AssetType.SOL_USDC, priceData);
    } catch (error) {
        console.error("Error parsing SOL_USDC:", error);
    }
});

redis.subscribe("ETH_USDC", (message) => {
    try {
        const priceData: PriceData = JSON.parse(message);
        currentPrices[AssetType.ETH_USDC] = priceData;
        checkPositionUpdates(AssetType.ETH_USDC, priceData);
    } catch (error) {
        console.error("Error parsing ETH_USDC:", error);
    }
});

redis.subscribe("BTC_USDC", (message) => {
    try {
        const priceData: PriceData = JSON.parse(message);
        currentPrices[AssetType.BTC_USDC] = priceData;
        checkPositionUpdates(AssetType.BTC_USDC, priceData);
    } catch (error) {
        console.error("Error parsing BTC_USDC:", error);
    }
});

export let UserState: UserDetails[] = [];
export let OpenOrders: OpenOrdersDetails[] = [];

// Signup
router.post("/signup", (req: Request, res: Response) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({
            error: "Username and password required"
        });
    }
    
    const existingUser = UserState.find(u => u.username === username);
    if (existingUser) {
        return res.status(400).json({
            error: "User already exists"
        });
    }
    
    const userId = getRandomOrderId();
    const user: UserDetails = {
        userId,
        username,
        password,
        balance: {
            usd: 50000
        },
        totalPnL: 0
    };
    
    UserState.push(user);
    
    return res.status(200).json({
        success: true,
        msg: "Successfully signed up",
        userId,
        balance: user.balance.usd
    });
});

// Open position - ONLY margin and leverage (CFD trading)
router.post("/position/open", (req: Request, res: Response) => {
    const { userId, type, asset, margin, leverage, stoploss, takeprofit } = req.body;
    
    // Validate required fields
    if (!userId || !type || !asset || !margin || !leverage) {
        return res.status(400).json({
            error: "Missing required fields: userId, type, asset, margin, leverage"
        });
    }
    
    // Find user
    const user = UserState.find(u => u.userId === userId);
    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }
    
    // Validate leverage
    if (!ALLOWED_LEVERAGE.includes(leverage)) {
        return res.status(400).json({
            error: `Invalid leverage. Allowed: ${ALLOWED_LEVERAGE.join(", ")}`
        });
    }
    
    // Validate position type
    if (type !== OrderType.LONG && type !== OrderType.SHORT) {
        return res.status(400).json({
            error: "Invalid type. Use 'LONG' or 'SHORT'"
        });
    }
    
    // Validate margin
    if (margin <= 0) {
        return res.status(400).json({
            error: "Margin must be positive"
        });
    }
    
    // Check balance
    if (user.balance.usd < margin) {
        return res.status(400).json({
            error: "Insufficient balance",
            required: margin.toFixed(2),
            available: user.balance.usd.toFixed(2)
        });
    }
    
    // Get current price
    const priceData = getCurrentPrice(asset as AssetType);
    // Use ask price for LONG (buying), bid price for SHORT (selling)
    const entryPrice = type === OrderType.LONG ? priceData.ask : priceData.bid;
    
    // Calculate position value and quantity
    const positionValue = margin * leverage;
    const quantity = positionValue / entryPrice;
    
    // Validate stop loss
    if (stoploss !== undefined) {
        if (type === OrderType.LONG && stoploss >= entryPrice) {
            return res.status(400).json({
                error: "Stop loss must be below entry price for LONG"
            });
        }
        if (type === OrderType.SHORT && stoploss <= entryPrice) {
            return res.status(400).json({
                error: "Stop loss must be above entry price for SHORT"
            });
        }
    }
    
    // Validate take profit
    if (takeprofit !== undefined) {
        if (type === OrderType.LONG && takeprofit <= entryPrice) {
            return res.status(400).json({
                error: "Take profit must be above entry price for LONG"
            });
        }
        if (type === OrderType.SHORT && takeprofit >= entryPrice) {
            return res.status(400).json({
                error: "Take profit must be below entry price for SHORT"
            });
        }
    }
    
    // Deduct margin
    user.balance.usd -= margin;
    
    // Create order
    const orderId = getRandomOrderId();
    const order: OpenOrdersDetails = {
        orderId,
        userId,
        type: type as OrderType,
        asset: asset as AssetType,
        entryPrice,
        quantity,
        margin,
        leverage,
        stoploss,
        takeprofit,
        timestamp: Date.now()
    };
    
    OpenOrders.push(order);
    
    console.log(`✅ Position Opened: ${type} ${asset}`);
    console.log(`   Margin: $${margin} | Leverage: ${leverage}x`);
    console.log(`   Entry: $${entryPrice} | Quantity: ${quantity.toFixed(4)}`);
    
    return res.status(200).json({
        success: true,
        msg: "Position opened successfully",
        position: {
            orderId,
            type,
            asset,
            entryPrice: entryPrice.toFixed(2),
            quantity: quantity.toFixed(4),
            margin: margin.toFixed(2),
            leverage: `${leverage}x`,
            positionValue: positionValue.toFixed(2),
            stoploss,
            takeprofit
        },
        account: {
            availableBalance: user.balance.usd.toFixed(2)
        }
    });
});

// Close position
router.post("/position/close/:orderId", (req: Request, res: Response) => {
    const { orderId } = req.params;
    
    const orderIndex = OpenOrders.findIndex(x => x.orderId === orderId);
    if (orderIndex === -1) {
        return res.status(404).json({
            error: "Order not found"
        });
    }
    
    const order = OpenOrders[orderIndex];
    if(!order){
        return
    }
    const user = UserState.find(x => x.userId === order.userId);
    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }
    
    const priceData = getCurrentPrice(order.asset);
    // Use bid price for closing LONG (selling), ask price for closing SHORT (buying back)
    const exitPrice = order.type === OrderType.LONG ? priceData.bid : priceData.ask;
    const pnl = calculatePnL(order, exitPrice);
    
    // Return margin + PnL
    user.balance.usd += order.margin + pnl;
    user.totalPnL += pnl;
    
    OpenOrders.splice(orderIndex, 1);
    
    const roi = ((pnl / order.margin) * 100).toFixed(2);
    
    console.log(`📊 Position Closed: ${order.type} ${order.asset}`);
    console.log(`   P&L: $${pnl.toFixed(2)} (${roi}% ROI)`);
    
    return res.status(200).json({
        success: true,
        msg: "Position closed successfully",
        closedPosition: {
            orderId: order.orderId,
            type: order.type,
            asset: order.asset,
            entryPrice: order.entryPrice.toFixed(2),
            exitPrice: exitPrice.toFixed(2),
            pnl: pnl.toFixed(2),
            roi: roi + "%"
        },
        account: {
            balance: user.balance.usd.toFixed(2)
        }
    });
});

// Get balance
router.get("/balance/:userId", (req: Request, res: Response) => {
    const { userId } = req.params;
    
    const user = UserState.find(x => x.userId === userId);
    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }
    
    const userPositions = OpenOrders.filter(x => x.userId === userId);
    let totalMargin = 0;
    let totalUnrealizedPnL = 0;
    
    userPositions.forEach(position => {
        const priceData = getCurrentPrice(position.asset);
        const currentPrice = position.type === OrderType.LONG ? priceData.bid : priceData.ask;
        const pnl = calculatePnL(position, currentPrice);
        
        totalMargin += position.margin;
        totalUnrealizedPnL += pnl;
    });
    
    const equity = user.balance.usd + totalMargin + totalUnrealizedPnL;
    
    return res.status(200).json({
        success: true,
        username: user.username,
        balance: {
            available: user.balance.usd.toFixed(2),
            usedMargin: totalMargin.toFixed(2),
            freeMargin: user.balance.usd.toFixed(2),
            equity: equity.toFixed(2),
            unrealizedPnL: totalUnrealizedPnL.toFixed(2),
            totalPnL: user.totalPnL.toFixed(2)
        },
        openPositions: userPositions.length
    });
});

// Get positions
router.get("/positions/:userId", (req: Request, res: Response) => {
    const { userId } = req.params;
    
    const userPositions = OpenOrders.filter(x => x.userId === userId);
    
    const positions = userPositions.map(position => {
        const priceData = getCurrentPrice(position.asset);
        const currentPrice = position.type === OrderType.LONG ? priceData.bid : priceData.ask;
        const pnl = calculatePnL(position, currentPrice);
        const roi = ((pnl / position.margin) * 100).toFixed(2);
        
        return {
            orderId: position.orderId,
            type: position.type,
            asset: position.asset,
            entryPrice: position.entryPrice.toFixed(2),
            currentPrice: currentPrice.toFixed(2),
            quantity: position.quantity.toFixed(4),
            leverage: `${position.leverage}x`,
            margin: position.margin.toFixed(2),
            unrealizedPnL: pnl.toFixed(2),
            roi: roi + "%",
            stoploss: position.stoploss,
            takeprofit: position.takeprofit,
            timestamp: new Date(position.timestamp).toISOString()
        };
    });
    
    return res.status(200).json({
        success: true,
        positions,
        totalPositions: positions.length
    });
});

// Helper functions
function getRandomOrderId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function calculatePnL(position: OpenOrdersDetails, currentPrice: number): number {
    if (position.type === OrderType.LONG) {
        return (currentPrice - position.entryPrice) * position.quantity;
    } else {
        return (position.entryPrice - currentPrice) * position.quantity;
    }
}

function getCurrentPrice(asset: AssetType): PriceData {
    return currentPrices[asset] || { bid: 141, ask: 141, price: 141 };
}

export default router;
export { router as orderrouter };