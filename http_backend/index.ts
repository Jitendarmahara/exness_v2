import express from "express"
import { CandleRouter } from "./route/candle";
const app = express();
app.use(express.json());


app.use("/api/candles" , CandleRouter)


app.listen(3000 , ()=>{
    console.log("server stated at 3000")
})