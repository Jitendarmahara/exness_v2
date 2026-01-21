// picks the data and update the databse
import { createClient } from "redis";
import{StartRedis} from "../redis";
import {getDatabase} from "../db/setup"

interface TickData{
    data:{
        p:string,
        q:string,
        e:string,
        s:string,
        T:string,
        m:boolean
    },
    stream:string
}

interface BatchData{
    market:string,
    price : number,
    volume :number,
    timestamp:number
}

let Batch: BatchData[] = []
const batch_size = 100;
const batch_time = 1000;
let last_flush = Date.now();
const sql =  getDatabase();
console.log(sql);
console.log("POLLER DATABASE_URL =", process.env.DATABASE_URL);


async function redispoller() {
    const redis = await StartRedis("redis://@localhost:6379");
    const publishclient = createClient();
    await publishclient.connect();

    async function flushbatch () {
        if(Batch.length === 0){
            return;
        }

        try{
             await sql`
                INSERT INTO ticks ${sql(Batch, 'market', 'price', 'volume', 'timestamp')}
            `;
            Batch = [];

            console.log("update succesfully")
        }
        catch(e){
            console.log("error while updatng the db" , e)
        }
    }

    while(true){
        try{
            console.log("hi have beeb started")
            const result  = await redis.brPop("@KlineData" ,1);

            if(!result && Date.now() - last_flush > batch_time){
                await flushbatch();
                last_flush = Date.now();
                Batch = [];
            }
            if(!result){
                continue;
            }
            const parsed_data = JSON.parse(result.element);
           // console.log(parsed_data);
           const {data, stream} = parsed_data;

        // Store prices in a map to combine bookTicker and trade data
        const priceStore: Record<string, {bid?: number, ask?: number, price?: number}> = {
            "SOL_USDC": {},
            "BTC_USDC": {}, 
            "ETH_USDC": {}
        };

        if(stream.startsWith("bookTicker")){
            // BookTicker gives us bid/ask
            const asset = stream.replace("bookTicker.", "");
            
            // Your pricing logic
            const bid = Number(data.a);  // bid = market ask
            const ask = Number(data.a) + Number(data.a)*20/100; // ask = bid + 20%
            
            // Update store
            if(priceStore[asset]){
                priceStore[asset].bid = bid;
                priceStore[asset].ask = ask;
                
                // If we have price from trade, publish now
                if(priceStore[asset].price !== undefined){
                    publishPrice(asset, {
                        bid,
                        ask,
                        price: priceStore[asset].price!
                    });
                }
            }
        }

        if(stream.startsWith("trade")){
            // Trade gives us last price
            const asset = stream.replace("trade.", "");
            const price = Number(data.p);
            
            // Update store
            if(priceStore[asset]){
                priceStore[asset].price = price;
                
                // If we have bid/ask from bookTicker, publish now
                if(priceStore[asset].bid !== undefined && priceStore[asset].ask !== undefined){
                    publishPrice(asset, {
                        bid: priceStore[asset].bid!,
                        ask: priceStore[asset].ask!,
                        price
                    });
                }
            }
        }

        function publishPrice(asset: string, priceData: {bid: number, ask: number, price: number}){
            if(asset === "SOL_USDC"){
                publishclient.publish("SOL_USDC", JSON.stringify(priceData));
            }
            if(asset === "BTC_USDC"){
                publishclient.publish("BTC_USDC", JSON.stringify(priceData));
            }
            if(asset === "ETH_USDC"){
                publishclient.publish("ETH_USDC", JSON.stringify(priceData));
            }
        }
            const market = stream.replace("trade." , "");
            
            // FIX: Convert timestamp from microseconds to milliseconds
            let timestamp = Number(data.T);
            
            // If timestamp is in microseconds (too large), divide by 1000
            if (timestamp > 10000000000000) {
                timestamp = Math.floor(timestamp / 1000);
            }
            
            Batch.push({
                market,
                price: parseFloat(data.p), // Changed from parseInt to parseFloat for decimals
                volume: parseFloat(data.q), // Changed from parseInt to parseFloat for decimals
                timestamp: timestamp // Use normalized timestamp
            })
            console.log(Batch);
            if(Batch.length >= batch_size){
                await flushbatch();
            }
        }
        catch(e){
            return await new Promise(resolve => setTimeout(resolve , 1000))
        }
    }
}


redispoller().catch(err=>console.log(err));