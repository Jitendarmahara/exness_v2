import { WebSocketServer } from "ws";
import { UserManager } from "./usermanager";
const wss = new WebSocketServer({port:8080});

wss.on("connection" , (ws)=>{
    UserManager.getInstance().adduser(ws);
})