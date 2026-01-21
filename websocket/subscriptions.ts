// this file handles the subscribe and unsubscribe 
import { createClient, type RedisClientType } from "redis";
import { UserManager } from "./usermanager";
export class SubscriptionManager{
    private static  instance: SubscriptionManager;
    private subscription: Map<string , string[]> = new Map(); // this is id to room;
    private reversesubscription: Map<string ,string[]> = new Map(); // this  is room to id;
    private redisclient:RedisClientType
    constructor(){
        this.redisclient = createClient();
        this.redisclient.connect();
    }

    public static  getInstance(){
        if(!this.instance){
            this.instance = new SubscriptionManager();
        }
        return this.instance;
    }

    public subscribe(id:string , room:string){
        if(!this.subscription.get(id)){
            this.subscription = new Map();
        }
        this.subscription.set(id , []);
        this.subscription.get(id)?.push(room);

        if(!this.reversesubscription.get(id)){
            this.reversesubscription = new Map();
        }
        this.reversesubscription.set(room , []);
        this.reversesubscription.get(room)?.push(id) ;

        if(this.subscription.get(id)?.length === 1){
            this.redisclient.subscribe(room , this.rediscallbackhandler );
        }
    }

    

    public rediscallbackhandler = (message:string , channel:string)=>{
        this.reversesubscription.get(channel)?.forEach(x => UserManager.getInstance().getuser(x)?.emit(message))
    }

    public unsubscribe(id:string , room:string){  // the room_is basically the markte name to which the user is subscribed 
        this.subscription.get(id)?.filter(x => x!== room)
        this.reversesubscription.get(room)?.filter(x => x!== id);

        if(this.reversesubscription.get(room)?.length === 0){
            this.reversesubscription.delete(room);
            this.redisclient.unsubscribe(room)
        }

    }

    public userleft(id:string ){
        this.subscription.get(id)?.forEach(x => this.unsubscribe(id , x))
    }

    public getsubscriptions(id:string){
        return this.subscription.get(id) || []
    } // return all the rooms the user is subscribed
}