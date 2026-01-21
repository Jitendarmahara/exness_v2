import type { WebSocket } from "ws";
import { SubscriptionManager } from "./subscriptions";

// this is overall struct how the users looks;
export class User{
    private id:string;
    private ws:WebSocket

    constructor(id:string , ws:WebSocket ){
        this.id = id;
        this.ws = ws;
        this.addlistner(ws);
    }


    private addlistner(ws:WebSocket){
        ws.on("message" , (message)=>{
            const parsed_data = JSON.parse(message.toString());
            const room = parsed_data.room;
            if(parsed_data.type === "SUBSCRIBE"){
                console.log("hi subscribe was called");
                SubscriptionManager.getInstance().subscribe(this.id , room)
            }
            if(parsed_data.type === "UNSUBSCRIBE"){
                SubscriptionManager.getInstance().unsubscribe(this.id , room)
            }
        })
    }

    public emit(message:string){
        this.ws.send(JSON.stringify(message))
    }
}