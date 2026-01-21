// server/candleAggregator.ts
import { getDatabase } from "../db/setup";
import cron from "node-cron";

const sql = getDatabase();

const TIMEFRAMES = {
    "1m": { interval: 60 * 1000, table: "candles_1m" },
    "5m": { interval: 5 * 60 * 1000, table: "candles_5m" },
    "15m": { interval: 15 * 60 * 1000, table: "candles_15m" },
    "1h": { interval: 60 * 60 * 1000, table: "candles_1h" },
    "4h": { interval: 4 * 60 * 60 * 1000, table: "candles_4h" },
    "1d": { interval: 24 * 60 * 60 * 1000, table: "candles_1d" },
    "1w": { interval: 7 * 24 * 60 * 60 * 1000, table: "candles_1w" }
};

const MARKETS = ["SOL_USDC", "BTC_USDC", "ETH_USDC"];

function getCandleStartTime(timestamp: number, interval: number): number {
    return Math.floor(timestamp / interval) * interval;
}

async function aggregateCandle(
    market: string, 
    timeframe: string, 
    intervalMs: number,
    tableName: string
) {
    try {
        const now = Date.now();
        const currentCandleStart = getCandleStartTime(now, intervalMs);
        const previousCandleStart = currentCandleStart - intervalMs;
        const previousCandleEnd = currentCandleStart;
        console.log(market);
        // Aggregate ticks for the PREVIOUS completed candle
        const result = await sql`
            SELECT 
                MIN(price) as low,
                MAX(price) as high,
                SUM(volume) as volume,
                COUNT(*) as trades_count,
                (SELECT price FROM ticks 
                 WHERE market = ${market} 
                 AND timestamp >= ${previousCandleStart} 
                 AND timestamp < ${previousCandleEnd}
                 ORDER BY timestamp ASC LIMIT 1) as open,
                (SELECT price FROM ticks 
                 WHERE market = ${market} 
                 AND timestamp >= ${previousCandleStart} 
                 AND timestamp < ${previousCandleEnd}
                 ORDER BY timestamp DESC LIMIT 1) as close
            FROM ticks
            WHERE market = ${market}
            AND timestamp >= ${previousCandleStart}
            AND timestamp < ${previousCandleEnd}
        `;
        
        if (result[0] && result[0].open !== null) {
            const candle = result[0];
            
            // Insert into the SPECIFIC timeframe table (candles_1m, candles_5m, etc.)
           await sql`
  INSERT INTO ${sql(tableName)} (
    market, open, high, low, close, volume, start_time, end_time
  )
  VALUES (
    ${market},
    ${candle.open},
    ${candle.high},
    ${candle.low},
    ${candle.close},
    ${candle.volume || 0},
    ${previousCandleStart},
    ${previousCandleEnd}
  )
  ON CONFLICT (market, start_time)
  DO UPDATE SET
    high = EXCLUDED.high,
    low = EXCLUDED.low,
    close = EXCLUDED.close,
    volume = EXCLUDED.volume
`;

            
            console.log(`[${timeframe}] ${market}: O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close} V=${candle.volume}`);
        } else {
            console.log(`[${timeframe}] ${market}: No ticks found for previous candle`);
        }
        
    } catch (e) {
        console.error(`Error aggregating ${timeframe} for ${market}:`, e);
    }
}

async function runAggregation() {
    const timestamp = new Date().toISOString();
    console.log(`\n🔄 [${timestamp}] Running candle aggregation...`);
    
    for (const market of MARKETS) {
        console.log(market);
        for (const [timeframe, config] of Object.entries(TIMEFRAMES)) {
            await aggregateCandle(
                market, 
                timeframe, 
                config.interval,
                config.table  // Pass the table name (candles_1m, etc.)
            );
        }
    }
    
    console.log("✅ Aggregation cycle complete\n");
}

// Run every minute
cron.schedule("* * * * *", () => {
    runAggregation().catch(console.error);
});

console.log("Candle aggregator started");
console.log("Aggregating to 7 separate tables:");
console.log(" candles_1m, candles_5m, candles_15m");
console.log(" candles_1h, candles_4h");  
console.log("candles_1d, candles_1w");
console.log(`Markets: ${MARKETS.join(", ")}`);
console.log("Running every minute at :00 seconds\n");

// Run immediately on startup
runAggregation().catch(console.error);