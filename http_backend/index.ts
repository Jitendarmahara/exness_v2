import express from "express"
import { CandleRouter } from "./route/candle";
import { orderrouter } from "./route/order";
const app = express();
app.use(express.json());


app.use("/api/candles" , CandleRouter);
app.use("/api/trade" , orderrouter)


app.listen(3000 , ()=>{
    console.log("server stated at 3000")
})