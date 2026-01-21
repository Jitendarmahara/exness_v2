// this file basically manages all the users 

import type WebSocket from "ws";
import { User } from "./user";
import { SubscriptionManager } from "./subscriptions";

export class UserManager{
    private user:Map<string , User> = new Map();
    private static instance : UserManager ;
    private constructor(){



    }
     
    public static  getInstance(){
        if(!this.instance){
            this.instance = new UserManager();
        }
        return this.instance;
    }

    public adduser(ws:WebSocket){
        const id = this.getrandomId();
        const user = new User(id , ws);
        this.user.set(id , user);
        this.regestrationonclose(ws , id)
    }

    // this thing basicallly return 

    public getuser(id:string){
        return this.user.get(id);
    }

    public getrandomId(){
        return Math.random().toString();
    }

    public regestrationonclose(ws:WebSocket , id:string){
        ws.on("close" , ()=>{
            SubscriptionManager.getInstance().userleft(id)
        })
    }

}