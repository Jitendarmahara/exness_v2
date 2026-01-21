import { WebSocket } from "ws";
import {StartRedis} from "../redis"
import { serve } from "bun";
import { createClient } from "redis";
let globalId = 1;
async function Server(){
    let Solanaprice = 0;
    let Ethprice = 0;
    let Btcprice = 0;
    
    const market = ["SOL_USDC" , 'BTC_USDC' , 'ETH_USDC']
    const wss = new WebSocket("wss://ws.backpack.exchange/") 
    //connect to reids
    const redis  = await StartRedis("redis://@localhost:6379")
    // subscribed to all the 3 market ;
    wss.on('open' , ()=>{
        market.map(x =>{
            wss.send(JSON.stringify({
                method:"SUBSCRIBE",
                params: [`trade.${x} , bookTicker.${x}`],
                id: globalId++
            }))
        })
    })

    // on message push to the queue
    wss.on('message' , (msg)=>{
        try{
            const parsed_data = JSON.parse(msg.toString());
            if(!parsed_data){
                return;  // i have to check this what wee
            }
            // pusht the whoel object to the redis queue
            redis.lPush("@KlineData" , JSON.stringify(parsed_data));
            const{data, stream} = parsed_data
            // want to print all the prices that we are getting in real time in a format

            console.log(`Prices --> Sol:${Solanaprice} | Eth:${Ethprice} | Btc:${Btcprice}`)
        }
        catch(e){
            console.log("error while parssing the message" , e)
        }
    })

    wss.on('close' , ()=>{
        console.log("DISCONNECTED FROM THE BACKPACK_EXCHANGEE")
        setTimeout(Server , 5000)
    })

    wss.on("error"  , ()=>{
        console.log("Something wrong happend")
        wss.close();
    })
} 

Server().catch(console.error);