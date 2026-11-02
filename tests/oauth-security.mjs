import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {initStore,closeStore,consumeOAuthFlow} from '../server/store.js';
import {beginOAuth,finishOAuth} from '../server/oauth.js';
import {digest} from '../server/auth.js';
await initStore();const checks=[];
try{
 process.env.PUBLIC_ORIGIN='https://orbita-agenda.jretanamendez.workers.dev';
 for(const provider of ['google','github']){
  process.env[provider.toUpperCase()+'_CLIENT_ID']='test-client';process.env[provider.toUpperCase()+'_CLIENT_SECRET']='test-secret';
  let destination,cookie;
  const req={params:{provider},userId:'demo',headers:{},query:{},protocol:'https',get:()=> 'orbita-agenda.jretanamendez.workers.dev'};
  const res={append:(name,value)=>{cookie=value},redirect:url=>{destination=url}};
  await beginOAuth(req,res);const url=new URL(destination),state=url.searchParams.get('state');assert.ok(state.length>=43);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);assert.equal(url.searchParams.get('redirect_uri'),process.env.PUBLIC_ORIGIN+`/api/auth/${provider}/callback`);
  const flow=await consumeOAuthFlow(digest(state),provider);assert.equal(createHash('sha256').update(flow.verifier).digest('base64url'),url.searchParams.get('code_challenge'));assert.equal(await consumeOAuthFlow(digest(state),provider),undefined);checks.push(provider+': PKCE, estado aleatorio, cookie segura y flujo de un solo uso');
  await finishOAuth({...req,query:{state,code:'invalid'},headers:{cookie:'orbita_oauth_'+provider+'=wrong'}},res);assert.match(destination,/auth_error=invalid_state/);checks.push(provider+': rechaza CSRF antes de llamar al proveedor');
  await finishOAuth({...req,query:{state,code:'invalid'},headers:{cookie:'orbita_oauth_'+provider+'='+state}},res);assert.match(destination,/auth_error=cancelled/);checks.push(provider+': rechaza repetición de un flujo consumido');
 }
 const result={date:new Date().toISOString(),checks,passed:checks.length};console.log(JSON.stringify(result,null,2));await fs.writeFile('verification/oauth-security.json',JSON.stringify(result,null,2));
}finally{await closeStore()}
