import {AsyncLocalStorage} from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {seed} from './seed.js';
import {scoreTask} from './planner.js';
const dir=path.resolve(process.env.DATA_DIR||'data');let localPool,local={users:[],states:{},tokens:[]};
const database=new AsyncLocalStorage();
const activePool=()=>database.getStore()?.pool||localPool;
const pool=new Proxy({},{get(_,key){const p=activePool();return typeof p?.[key]==='function'?p[key].bind(p):p?.[key]}});
export const withDatabase=(pool,fn)=>database.run({pool},fn);
export async function withUserLock(userId,fn){
 if(!activePool())return fn();
 if(database.getStore()?.transaction)return fn();
 const c=await pool.getConnection();
 const scoped=new Proxy(c,{get(target,key){if(key==='getConnection')return async()=>new Proxy(c,{get(t,k){if(k==='release')return()=>{};return typeof t[k]==='function'?t[k].bind(t):t[k]}});return typeof target[key]==='function'?target[key].bind(target):target[key]}});
 try{await c.beginTransaction();await c.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);const result=await database.run({pool:scoped,transaction:true},fn);await c.commit();return result}catch(e){await c.rollback();throw e}finally{c.release()}
}
export const emptyState=()=>({capacity:4,dayStart:540,dayEnd:1080,courses:[],tasks:[],sessions:[],recommendations:[]});
export async function initStore(){
 await fs.mkdir(dir,{recursive:true});let legacy;try{legacy=JSON.parse(await fs.readFile(path.join(dir,'demo.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 if(process.env.MYSQL_HOST){
  localPool=mysql.createPool({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE||'orbita',connectionLimit:5,dateStrings:true,timezone:'Z',...(process.env.MYSQL_SSL_CA?{ssl:{ca:await fs.readFile(process.env.MYSQL_SSL_CA,'utf8'),rejectUnauthorized:true}}:{})});
  const sql=await fs.readFile(new URL('./schema.sql',import.meta.url),'utf8');for(const q of sql.split(';').map(x=>x.trim()).filter(Boolean))await pool.query(q);
  const [priorityColumn]=await pool.query("SHOW COLUMNS FROM recommendations LIKE 'priority'");if(!priorityColumn.length)await pool.query('ALTER TABLE recommendations ADD COLUMN priority TINYINT NOT NULL DEFAULT 0');
  const [modelColumn]=await pool.query("SHOW COLUMNS FROM recommendations LIKE 'model'");if(!modelColumn.length)await pool.query('ALTER TABLE recommendations ADD COLUMN model VARCHAR(100) NULL');
  const [rows]=await pool.execute('SELECT id FROM users WHERE id=?',['demo']);if(!rows.length){await pool.execute('INSERT INTO users (id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)',['demo','Estudiante','demo@orbita.local',null,new Date()]);await saveState(legacy||seed(),'demo')}
  return 'mysql';
 }
 try{local=JSON.parse(await fs.readFile(path.join(dir,'workspace.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 if(!local.states.demo){local.users.push({id:'demo',name:'Estudiante',email:'demo@orbita.local',password_hash:null,created_at:new Date().toISOString()});local.states.demo=legacy||seed();await flush()}return 'local';
}
async function flush(){const file=path.join(dir,'workspace.json');await fs.writeFile(file+'.tmp',JSON.stringify(local,null,2));await fs.rename(file+'.tmp',file)}
export async function getState(userId='demo'){
 if(!activePool())return structuredClone({...emptyState(),...local.states[userId]});
 const [[settings]]=await pool.execute('SELECT capacity,day_start,day_end FROM preferences WHERE user_id=?',[userId]);
 const [courses]=await pool.execute('SELECT id,name,code,professor,color FROM courses WHERE user_id=? ORDER BY created_at,id',[userId]);
 const [tasks]=await pool.execute('SELECT id,title,description,course_id AS courseId,due_date AS due,hours,progress,difficulty,importance,type,status,priority_calculated AS score,created_at AS createdAt FROM tasks WHERE user_id=? ORDER BY created_at,id',[userId]);
 const [sessions]=await pool.execute('SELECT id,task_id AS taskId,date,start_minute AS start,hours FROM study_sessions WHERE user_id=? ORDER BY date,start_minute',[userId]);
 const [recommendations]=await pool.execute('SELECT id,task_id AS taskId,source,model,priority,text,created_at AS createdAt FROM recommendations WHERE user_id=? ORDER BY created_at DESC LIMIT 20',[userId]);
 return {capacity:Number(settings?.capacity||4),dayStart:settings?.day_start??540,dayEnd:settings?.day_end??1080,courses,tasks:tasks.map(t=>({...t,hours:Number(t.hours),progress:Number(t.progress)})),sessions:sessions.map(s=>({...s,hours:Number(s.hours)})),recommendations};
}
export async function saveState(state,userId='demo'){
 const next={...emptyState(),...state};next.tasks=next.tasks.map(t=>({...t,score:scoreTask(t,next.tasks).score}));if(!activePool()){local.states[userId]=structuredClone(next);await flush();return}
 const c=await pool.getConnection(),outer=database.getStore()?.transaction;try{if(!outer)await c.beginTransaction();
  await c.execute('INSERT INTO preferences (user_id,capacity,day_start,day_end) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE capacity=VALUES(capacity),day_start=VALUES(day_start),day_end=VALUES(day_end)',[userId,next.capacity,next.dayStart,next.dayEnd]);
  for(const table of ['recommendations','study_sessions','tasks','courses'])await c.execute(`DELETE FROM ${table} WHERE user_id=?`,[userId]);
  for(const x of next.courses)await c.execute('INSERT INTO courses (user_id,id,name,code,professor,color) VALUES (?,?,?,?,?,?)',[userId,x.id,x.name,x.code||'',x.professor||'',x.color]);
  for(const x of next.tasks)await c.execute('INSERT INTO tasks (user_id,id,title,description,course_id,due_date,hours,progress,difficulty,importance,type,status,priority_calculated,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[userId,x.id,x.title,x.description||'',x.courseId,x.due,x.hours,x.progress,x.difficulty,x.importance,x.type,x.status,x.score||0,x.createdAt?new Date(x.createdAt):new Date()]);
  for(const x of next.sessions)await c.execute('INSERT INTO study_sessions (user_id,id,task_id,date,start_minute,hours) VALUES (?,?,?,?,?,?)',[userId,x.id,x.taskId,x.date,x.start??null,x.hours]);
  for(const x of next.recommendations.slice(0,20))await c.execute('INSERT INTO recommendations (user_id,id,task_id,source,model,priority,text,created_at) VALUES (?,?,?,?,?,?,?,?)',[userId,x.id,next.tasks.some(t=>t.id===x.taskId)?x.taskId:null,x.source,x.model||null,x.priority||0,x.text,new Date(x.createdAt)]);
  if(!outer)await c.commit();
 }catch(e){if(!outer)await c.rollback();throw e}finally{c.release()}
}
export async function findUser(email){if(!activePool())return local.users.find(u=>u.email===email);const [r]=await pool.execute('SELECT * FROM users WHERE email=?',[email]);return r[0]}
export async function userById(id){if(!activePool())return local.users.find(u=>u.id===id);const [r]=await pool.execute('SELECT * FROM users WHERE id=?',[id]);return r[0]}
export async function createUser(user){if(!activePool()){local.users.push(user);local.states[user.id]=emptyState();await flush()}else{await pool.execute('INSERT INTO users (id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)',[user.id,user.name,user.email,user.password_hash,new Date()]);await saveState(emptyState(),user.id)}}
export async function saveToken(hash,userId,expires){if(!activePool()){local.tokens.push({hash,userId,expires});await flush()}else await pool.execute('INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[hash,userId,new Date(expires)])}
export async function tokenUser(hash){if(!activePool())return local.tokens.find(t=>t.hash===hash&&t.expires>Date.now())?.userId;const [r]=await pool.execute('SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at>NOW()',[hash]);return r[0]?.user_id}
export async function deleteToken(hash){if(!activePool()){local.tokens=local.tokens.filter(t=>t.hash!==hash);await flush()}else await pool.execute('DELETE FROM auth_sessions WHERE token_hash=?',[hash])}
export async function closeStore(){if(activePool())await pool.end()}
export async function saveOAuthFlow(hash,provider,verifier,userId){if(!activePool())throw Error('OAuth requiere MySQL');await pool.execute('DELETE FROM oauth_flows WHERE expires_at<NOW() LIMIT 100',[]);await pool.execute('INSERT INTO oauth_flows (state_hash,provider,verifier,user_id,expires_at) VALUES (?,?,?,?,?)',[hash,provider,verifier,userId,new Date(Date.now()+600000)])}
export async function consumeOAuthFlow(hash,provider){const c=await pool.getConnection();try{await c.beginTransaction();const [r]=await c.execute('SELECT verifier,user_id AS userId FROM oauth_flows WHERE state_hash=? AND provider=? AND expires_at>NOW() FOR UPDATE',[hash,provider]);await c.execute('DELETE FROM oauth_flows WHERE state_hash=?',[hash]);await c.commit();return r[0]}catch(e){await c.rollback();throw e}finally{c.release()}}
export async function findIdentity(provider,subject){const [r]=await pool.execute('SELECT user_id AS userId FROM oauth_identities WHERE provider=? AND provider_user_id=?',[provider,subject]);return r[0]}
export async function linkIdentity(provider,subject,userId){await pool.execute('INSERT INTO oauth_identities (provider,provider_user_id,user_id) VALUES (?,?,?)',[provider,subject,userId])}
export async function linkedProviders(userId){if(!activePool())return [];const [r]=await pool.execute('SELECT provider FROM oauth_identities WHERE user_id=?',[userId]);return r.map(x=>x.provider)}
const localActions=new Map();
export async function saveChatAction(action,userId){if(!activePool()){localActions.set(action.id,{...action,userId,status:'pending',fresh:1});return}await pool.execute('INSERT INTO chat_actions (id,user_id,kind,payload) VALUES (?,?,?,?)',[action.id,userId,action.kind,JSON.stringify(action.payload)])}
export async function getChatAction(id,userId){if(!activePool()){const a=localActions.get(id);return a?.userId===userId?a:undefined}const [r]=await pool.execute("SELECT id,kind,payload,status,result_id AS resultId,created_at>UTC_TIMESTAMP()-INTERVAL 15 MINUTE AS fresh FROM chat_actions WHERE id=? AND user_id=? FOR UPDATE",[id,userId]);const a=r[0];return a?{...a,payload:typeof a.payload==='string'?JSON.parse(a.payload):a.payload}:undefined}
export async function finishChatAction(id,userId,resultId){if(!activePool()){const a=localActions.get(id);if(a?.userId===userId)Object.assign(a,{status:'applied',resultId});return}await pool.execute("UPDATE chat_actions SET status='applied',result_id=? WHERE id=? AND user_id=?",[resultId,id,userId])}

