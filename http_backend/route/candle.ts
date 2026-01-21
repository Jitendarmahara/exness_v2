import { Router, type Request, type Response } from "express";
import {getDatabase} from "../../db/setup"
import postgres from "postgres";
const router = Router();

const TIMEFRAMES_TABLE :Record<string , string> = {
    "1m":"candles_1m",
    "5m":"candles_5m",
    "15m":"candles_15m",
    "1h": "candles_1h",
    "4h": "candles_4h",
    "1d": "candles_1d",
    "1w": "candles_1w"
};

const sql = postgres(process.env.DATABASE_URL!)
// the  user send us the timframe in the url we get and send it  the limit of the  candle data send ohcle;
router.get("/timeframe/:time/:market " , async (req:Request , res:Response)=>{
    try{
        // all verfiy is user is signed or not 

        const {time} = req.params;
        const {market} = req.params;
        // normalize paramto a single string (Express params can be string or string[])
        const timeframe = Array.isArray(time) ? time[0] : time;
        const parse_market = Array.isArray(market)?market[0]:market;
        if(!parse_market){
            return res.status(400).json({
                msg:"wrong market"
            })
        }

        if(!timeframe){
            return res.status(400).json({
                msg:"wrong input schema"
            })
        }

        const table = TIMEFRAMES_TABLE[timeframe];

        if(!table){
            return res.status(404).json({
                success:false,
                data:null,
                error:"Invalid Time Frame"
            })
        }

        const result = await sql`
            SELECT 
            market,
            open,
            high,
            low,
            close,
            volume,
            start_time,
            end_time
            FROM ${sql(table)}
            WHERE market = ${parse_market}
            ORDER BY start_time ASC
            LIMIT 50
        `;


        return res.status(200).json({
            success:true,
            data:result,
            msg: `candles for timeframe ${time}`
        })

    }
    catch(e){
        console.log("erro in the db route", e)
        return res.status(401).json({
            success:false,
            data:null,
        })
    }
})

export default router
export {router as CandleRouter}