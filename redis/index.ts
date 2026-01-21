;
import { createClient, type RedisClientType  } from "redis";

export async function StartRedis(url:string):Promise<RedisClientType>{

    const client:RedisClientType  = createClient();

    client.on('error' , err=>console.log("Redis client erro" , err));

    await client.connect();

    return client
}