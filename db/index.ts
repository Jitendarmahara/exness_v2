import postgres from "postgres";
import {readFileSync} from 'fs'

const database_url = process.env.DATABASE_URL!;

async function Dbsetup(){

    const sql = postgres(database_url);
    try{
        const schema = readFileSync("./schema.sql" , "utf-8");
        await sql.unsafe(schema);
    }
    finally{
        await sql.end()
    }
}

Dbsetup().catch(e=>{
    console.log(e)
})
