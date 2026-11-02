import {createServer} from 'node:http';
import {httpServerHandler} from 'cloudflare:node';
import mysql from 'mysql2/promise';
import {createApi} from '../server/api.js';
import {withDatabase} from '../server/store.js';

const app=createApi({storage:'mysql',publicMode:true});
// Incoming Worker requests carry their original TLS state through the Node bridge.
app.set('trust proxy',false);
const handler=httpServerHandler(createServer(app));
function queryAdapter(target){return new Proxy(target,{get(t,key){if(key==='execute')return t.query.bind(t);if(key==='getConnection')return async()=>queryAdapter(await t.getConnection());return typeof t[key]==='function'?t[key].bind(t):t[key]}})}
function database(env){const h=env.MYSQL;return queryAdapter(mysql.createPool({host:h.host,port:h.port,user:h.user,password:h.password,database:h.database,connectionLimit:3,dateStrings:true,timezone:'Z',connectTimeout:15000,disableEval:true}))}

export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  const ip=request.headers.get('cf-connecting-ip')||'local';
  const limiter=path.startsWith('/api/auth/')?env.AUTH_LIMIT:['/api/advice','/api/chat'].includes(path)?env.AI_LIMIT:null;
  if(limiter&&!(await limiter.limit({key:ip})).success)return Response.json({error:'Demasiados intentos. Espera un minuto.'},{status:429,headers:{'Cache-Control':'no-store'}});
  const pool=database(env);
  try{return await withDatabase(pool,async()=>{
   const response=await handler.fetch(request,env,ctx);
   const headers=new Headers(response.headers);
   const cookies=response.headers.getSetCookie();
   if(cookies.length){headers.delete('set-cookie');for(const cookie of cookies)headers.append('set-cookie',cookie+(!cookie.includes('Secure')&&new URL(request.url).protocol==='https:'?'; Secure':''))}
   if(!response.body){ctx.waitUntil(pool.end());return new Response(null,{status:response.status,headers})}
   const stream=new TransformStream();
   ctx.waitUntil(response.body.pipeTo(stream.writable).finally(()=>pool.end()));
   return new Response(stream.readable,{status:response.status,headers});
  })}catch(e){ctx.waitUntil(pool.end());console.error('API failure',e.code||e.name);return Response.json({error:'No se pudo conectar con el servidor. Intenta de nuevo.'},{status:503,headers:{'Cache-Control':'no-store'}})}
 },
 async scheduled(event,env,ctx){
  const pool=database(env);
  try{await pool.query('SELECT 1 AS healthy');console.log(JSON.stringify({event:'mysql-healthcheck',ok:true,scheduledTime:event.scheduledTime}))}
  catch(e){console.error(JSON.stringify({event:'mysql-healthcheck',ok:false,code:e.code||e.name}));throw e}
  finally{await pool.end()}
 }
};

