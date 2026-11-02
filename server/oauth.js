import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {saveOAuthFlow,consumeOAuthFlow,findIdentity,linkIdentity,linkedProviders,findUser,createUser,withUserLock} from './store.js';
import {login,digest} from './auth.js';

const providers={google:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scope:'openid email profile'},github:{authorize:'https://github.com/login/oauth/authorize',token:'https://github.com/login/oauth/access_token',scope:'user:email'}};
export const availableProviders=()=>Object.keys(providers).filter(p=>process.env[p.toUpperCase()+'_CLIENT_ID']&&process.env[p.toUpperCase()+'_CLIENT_SECRET']);
export {linkedProviders};
const getOrigin=req=>process.env.PUBLIC_ORIGIN||`${req.protocol}://${req.get('host')}`;
const csrfCookie=(provider,value,origin,expires=600)=>`orbita_oauth_${provider}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/${provider}; Max-Age=${expires}${origin.startsWith('https:')?'; Secure':''}`;
async function json(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('provider_unavailable');return response.json()}

export async function beginOAuth(req,res){
 const provider=req.params.provider,config=providers[provider];
 if(!config||!availableProviders().includes(provider))return res.status(503).json({error:'Este método de acceso todavía no está configurado.'});
 const origin=getOrigin(req),state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 await saveOAuthFlow(digest(state),provider,verifier,req.userId==='demo'?null:req.userId);
 res.append('Set-Cookie',csrfCookie(provider,state,origin));
 const url=new URL(config.authorize);url.search=new URLSearchParams({client_id:process.env[provider.toUpperCase()+'_CLIENT_ID'],redirect_uri:origin+`/api/auth/${provider}/callback`,response_type:'code',scope:config.scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(provider==='google'?{prompt:'select_account'}:{})});
 res.redirect(url.href);
}

export async function finishOAuth(req,res){
 const provider=req.params.provider,origin=getOrigin(req),config=providers[provider];
 if(!config||!availableProviders().includes(provider))return res.redirect(origin+'/?auth_error=not_configured');
 const state=req.query.state,code=req.query.code,cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('orbita_oauth_'+provider+'='))?.split('=')[1];
 res.append('Set-Cookie',csrfCookie(provider,'',origin,0));
 if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state)||!cookie||!/^[A-Za-z0-9_-]{43}$/.test(cookie)||!timingSafeEqual(Buffer.from(cookie),Buffer.from(state)))return res.redirect(origin+'/?auth_error=invalid_state');
 const flow=await consumeOAuthFlow(digest(state),provider);
 if(!flow||typeof code!=='string'||code.length>2048)return res.redirect(origin+'/?auth_error=cancelled');
 try{
  const token=await json(config.token,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env[provider.toUpperCase()+'_CLIENT_ID'],client_secret:process.env[provider.toUpperCase()+'_CLIENT_SECRET'],code,code_verifier:flow.verifier,redirect_uri:origin+`/api/auth/${provider}/callback`,grant_type:'authorization_code'})});
  if(typeof token.access_token!=='string')throw Error('provider_unavailable');
  const headers={Authorization:'Bearer '+token.access_token,Accept:'application/json','User-Agent':'Orbita-Agenda'};
  let subject,email,name;
  if(provider==='google'){const u=await json('https://openidconnect.googleapis.com/v1/userinfo',{headers});if(!u.email_verified||typeof u.sub!=='string')throw Error('email_unverified');subject=u.sub;email=u.email;name=u.name||u.email?.split('@')[0]}
  else{const [u,emails]=await Promise.all([json('https://api.github.com/user',{headers}),json('https://api.github.com/user/emails',{headers})]);const primary=emails.find(x=>x.primary&&x.verified)||emails.find(x=>x.verified);if(!primary||!u.id)throw Error('email_unverified');subject=String(u.id);email=primary.email;name=u.name||u.login}
  if(typeof email!=='string'||email.length>254||subject.length>255)throw Error('provider_unavailable');email=email.toLowerCase().trim();
  let userId;
  await withUserLock(flow.userId||'demo',async()=>{
   const identity=await findIdentity(provider,subject);
   if(flow.userId){if(identity&&identity.userId!==flow.userId)throw Error('already_linked');if(!identity)await linkIdentity(provider,subject,flow.userId);userId=flow.userId;return}
   if(identity){userId=identity.userId;return}
   if(await findUser(email))throw Error('link_required');
   userId=randomUUID();await createUser({id:userId,name:String(name||'Estudiante').slice(0,100),email,password_hash:null});await linkIdentity(provider,subject,userId);
  });
  await login(res,userId);return res.redirect(origin+'/');
 }catch(e){const reason=['email_unverified','already_linked','link_required'].includes(e.message)?e.message:'provider_unavailable';return res.redirect(origin+'/?auth_error='+reason)}
}
