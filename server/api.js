import {confirmAction} from './chat-actions.js';
import {taskInput,courseInput} from './validation.js';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {getState,saveState,emptyState,findUser,userById,createUser,withUserLock} from './store.js';
import {hashPassword,checkPassword,identify,login,logout} from './auth.js';
import {Planner,todayISO} from './planner.js';
import {validateSession} from './sessions.js';
import {explainPlan} from './ai.js';
import {seed} from './seed.js';
import {chat} from './chat.js';
import {beginOAuth,finishOAuth,availableProviders,linkedProviders} from './oauth.js';
export function createApi({storage='mysql',publicMode=false}={}){
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'48kb'}));
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});next()});

app.use('/api',async(req,res,next)=>{const origin=req.get('origin');if(origin&&origin!==`${publicMode?'https':req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Origen no permitido'});res.set('Cache-Control','no-store');try{req.userId=await identify(req)||'demo';const expected=req.get('X-Orbita-Account');if(expected&&expected!==req.userId)return res.status(409).json({code:'SESSION_CHANGED',error:'La cuenta abierta cambió. Actualiza la agenda antes de continuar.'});if(req.userId==='demo'&&!((req.method==='GET'&&(req.path==='/state'||/^\/auth\/(google|github)(\/callback)?$/.test(req.path)))||(req.method==='POST'&&['/auth/register','/auth/login','/auth/logout'].includes(req.path))))return res.status(401).json({error:'Inicia sesión o crea tu cuenta para entrar a tu agenda.'});next()}catch(e){next(e)}});
async function bundle(userId){const state=userId==='demo'?emptyState():await getState(userId),user=userId==='demo'?{id:'demo',name:'',email:''}:await userById(userId);return {...state,analysis:new Planner(state).analyze(),user:{id:user.id,name:user.name,email:user.email,demo:user.id==='demo'},authProviders:availableProviders(),linkedProviders:userId==='demo'?[]:await linkedProviders(userId),storage,aiConfigured:Boolean(process.env.GROQ_API_KEY),today:todayISO()}}
app.get('/api/state',async(req,res)=>res.json(await bundle(req.userId)));
app.get('/api/auth/:provider/callback',finishOAuth);
app.get('/api/auth/:provider',beginOAuth);
let queue=Promise.resolve();
function locked(fn){return(req,res,next)=>{if(publicMode){const send=res.json.bind(res);let result;res.json=data=>{result=data;return res};withUserLock(req.userId,()=>fn(req,res)).then(()=>{res.json=send;send(result)},e=>{res.json=send;next(e)});return}const job=queue.then(()=>fn(req,res));queue=job.catch(()=>{});job.catch(next)}}
function mutate(fn){return locked(async(req,res)=>{const state=await getState(req.userId);await fn(state,req);const analysis=new Planner(state).analyze();const scores=new Map(analysis.tasks.map(t=>[t.id,t.score]));state.tasks=state.tasks.map(t=>({...t,score:scores.get(t.id)}));await saveState(state,req.userId);res.json(await bundle(req.userId))})}
function bad(message,status=400){const e=new Error(message);e.status=status;throw e}

const attempts=new Map();
function authRate(req){const key=publicMode?req.get('cf-connecting-ip')||req.ip:req.ip;const now=Date.now(),item=attempts.get(key)||{count:0,until:now+60000};if(item.until<now){item.count=0;item.until=now+60000}item.count++;attempts.set(key,item);if(item.count>20)bad('Demasiados intentos. Espera un minuto.',429)}
app.post('/api/auth/register',locked(async(req,res)=>{authRate(req);const {name,email,password}=req.body;if(typeof name!=='string'||!name.trim()||name.length>100||typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<8||password.length>128)bad('Indica nombre, correo válido y contraseña de 8 a 128 caracteres.');if(await findUser(email.toLowerCase().trim()))bad('Ese correo ya está registrado.',409);const user={id:randomUUID(),name:name.trim(),email:email.toLowerCase().trim(),password_hash:await hashPassword(password)};await createUser(user);await login(res,user.id);res.json(await bundle(user.id))}));
app.post('/api/auth/login',locked(async(req,res)=>{authRate(req);const {email,password}=req.body;if(typeof email!=='string'||typeof password!=='string'||password.length>128)bad('Credenciales inválidas.',401);const user=await findUser(email.toLowerCase().trim());if(!user||!await checkPassword(password,user.password_hash))bad('El correo o la contraseña no coinciden.',401);await login(res,user.id);res.json(await bundle(user.id))}));
app.post('/api/auth/logout',locked(async(req,res)=>{await logout(req,res);res.json({ok:true})}));

app.post('/api/tasks',mutate((s,r)=>{s.tasks.push({id:randomUUID(),...taskInput(r.body,s),createdAt:new Date().toISOString()})}));
app.put('/api/tasks/:id',mutate((s,r)=>{const i=s.tasks.findIndex(t=>t.id===r.params.id);if(i<0)bad('Actividad no encontrada.',404);const next={...s.tasks[i],...taskInput(r.body,s)};if(s.sessions.some(x=>x.taskId===next.id&&x.date>next.due))bad('Hay sesiones después de esa entrega. Muévelas o quítalas primero.');s.tasks[i]=next}));
app.delete('/api/tasks/:id',mutate((s,r)=>{if(!s.tasks.some(t=>t.id===r.params.id))bad('Actividad no encontrada.',404);s.tasks=s.tasks.filter(t=>t.id!==r.params.id);s.sessions=s.sessions.filter(x=>x.taskId!==r.params.id)}));

app.post('/api/courses',mutate((s,r)=>{s.courses.push({id:randomUUID(),...courseInput(r.body)})}));
app.put('/api/courses/:id',mutate((s,r)=>{const c=s.courses.find(c=>c.id===r.params.id);if(!c)bad('Curso no encontrado.',404);Object.assign(c,courseInput(r.body))}));
app.delete('/api/courses/:id',mutate((s,r)=>{const ids=s.tasks.filter(t=>t.courseId===r.params.id).map(t=>t.id);if(ids.length&&!r.body.cascade)bad('El curso tiene actividades. Confirma también su eliminación.');s.courses=s.courses.filter(c=>c.id!==r.params.id);s.tasks=s.tasks.filter(t=>!ids.includes(t.id));s.sessions=s.sessions.filter(x=>!ids.includes(x.taskId))}));
app.put('/api/preferences',mutate((s,r)=>{const capacity=Number(r.body.capacity),dayStart=Number(r.body.dayStart),dayEnd=Number(r.body.dayEnd);if(!Number.isFinite(capacity)||capacity<.5||capacity>12||!Number.isInteger(dayStart)||!Number.isInteger(dayEnd)||dayStart<480||dayEnd>1320||dayEnd-dayStart<capacity*60)bad('Revisa la disponibilidad: de 08:00 a 22:00 y capacidad dentro del intervalo.');Object.assign(s,{capacity,dayStart,dayEnd})}));
app.put('/api/capacity',mutate((s,r)=>{const capacity=Number(r.body.capacity);if(!Number.isFinite(capacity)||capacity<.5||capacity>12)bad('Usa entre 0.5 y 12 horas diarias.');s.capacity=capacity}));
app.post('/api/redistribute',mutate(s=>{s.sessions=new Planner(s).redistribute()}));
app.post('/api/sessions',mutate((s,r)=>{s.sessions.push({id:randomUUID(),...validateSession(s,r.body)})}));
app.put('/api/sessions/:id',mutate((s,r)=>{const session=s.sessions.find(x=>x.id===r.params.id);if(!session)bad('Sesión no encontrada.',404);Object.assign(session,validateSession(s,{...session,...r.body,start:r.body.start??session.start??540},session.id))}));
app.delete('/api/sessions/:id',mutate((s,r)=>{s.sessions=s.sessions.filter(x=>x.id!==r.params.id)}));
const aiTimes=new Map();app.post('/api/advice',async(req,res)=>{const last=aiTimes.get(req.userId)||0;if(Date.now()-last<3000)bad('Espera unos segundos antes de pedir otro consejo.',429);aiTimes.set(req.userId,Date.now());const question=req.body.question||'¿Qué debería hacer primero y cómo distribuyo mi semana?';if(typeof question!=='string'||question.length>1000)bad('La pregunta debe tener hasta 1000 caracteres.');const state=await getState(req.userId),analysis=new Planner(state).analyze();const result=await explainPlan(state,analysis,question);const record={id:randomUUID(),...result,createdAt:new Date().toISOString()};await withUserLock(req.userId,async()=>{const latest=await getState(req.userId);latest.recommendations=[record,...latest.recommendations].slice(0,20);await saveState(latest,req.userId)});res.json(record)});
app.post('/api/chat',chat);
app.post('/api/chat/actions/:id/confirm',locked(async(req,res)=>{const actionReceipt=await confirmAction(req.params.id,req.userId);res.json({...await bundle(req.userId),actionReceipt})}));
app.get('/api/export',async(req,res)=>{const state=publicMode&&req.userId==='demo'?{dayStart:540,dayEnd:1080,recommendations:[],...seed()}:await getState(req.userId);res.setHeader('Content-Disposition','attachment; filename="orbita-respaldo.json"');res.json({version:1,exportedAt:new Date().toISOString(),...state})});
app.post('/api/demo-sample',mutate((s,r)=>{if(s.tasks.length||s.courses.length)bad('Los ejemplos solo se cargan en una agenda vacía.');Object.assign(s,seed())}));
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((err,req,res,next)=>{if(!err.status)console.error('Error del servidor:',err.code||err.name,err.stack);res.status(err.status||500).json({error:err.status?err.message:'No se pudo completar la operación. Intenta de nuevo.'})});
return app;
}

