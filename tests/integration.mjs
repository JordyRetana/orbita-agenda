import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
const base=process.env.TEST_URL||'http://127.0.0.1:4173';const checks=[],ids=[];
let cookieA='',cookieB='';
async function request(p,method='GET',body,cookie=cookieA){const r=await fetch(base+'/api/'+p,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')}}
const check=(name,fn)=>{fn();checks.push({name,passed:true})};
try{
 let guest=await request('state','GET',undefined,'');assert.equal(guest.status,200);assert.equal(guest.data.tasks.length,0);assert.equal(guest.data.courses.length,0);
 for(const path of ['tasks','courses','preferences','advice','chat']){const denied=await request(path,'POST',{},'');assert.equal(denied.status,401)}
 assert.equal((await request('export','GET',undefined,'')).status,401);check('Login obligatorio y agenda anónima vacía',()=>assert.equal(guest.data.user.demo,true));
 const suffix=randomBytes(5).toString('hex'),password=randomBytes(16).toString('hex');const email='qa-'+suffix+'@orbita.test';
 let r=await request('auth/register','POST',{name:'Prueba de integración',email,password});assert.equal(r.status,200);cookieA=r.cookie.split(';')[0];ids.push(r.data.user.id);check('Cuenta con contraseña protegida y cookie HttpOnly',()=>{assert.ok(r.cookie.includes('HttpOnly'));assert.ok(r.cookie.includes('SameSite=Strict'));assert.equal(r.data.tasks.length,0);assert.equal(r.data.storage,'mysql')});
 const today=r.data.today;const due=new Date(today+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+5);const dueISO=due.toISOString().slice(0,10);
 r=await request('courses','POST',{name:'Curso QA',code:'QA-01',professor:'Docente',color:'#007aff'});assert.equal(r.status,200);const course=r.data.courses[0];
 r=await request('courses/'+course.id,'PUT',{...course,name:'Curso editado'});check('Crear y editar curso en MySQL',()=>assert.equal(r.data.courses[0].name,'Curso editado'));
 r=await request('tasks','POST',{title:'Actividad QA',description:'Prueba',courseId:course.id,due:dueISO,hours:3,progress:0,importance:5,difficulty:4,type:'Proyecto',status:'pending'});assert.equal(r.status,200);const task=r.data.tasks[0];check('Crear actividad y calcular prioridad',()=>assert.ok(r.data.analysis.tasks[0].score>0));
 r=await request('sessions','POST',{taskId:task.id,date:today,start:540,hours:1});assert.equal(r.status,200);let session=r.data.sessions[0];
 r=await request('sessions','POST',{taskId:task.id,date:today,start:570,hours:1});check('Rechazar cruce de sesiones',()=>assert.equal(r.status,400));
 r=await request('sessions/'+session.id,'PUT',{start:660,hours:1.5});check('Editar inicio y duración de sesión',()=>{assert.equal(r.data.sessions[0].start,660);assert.equal(r.data.sessions[0].hours,1.5)});
 r=await request('tasks/'+task.id,'PUT',{...task,progress:50});check('Actualizar avance y recalcular horas',()=>assert.equal(r.data.analysis.tasks[0].remaining,1.5));
 r=await request('preferences','PUT',{capacity:3,dayStart:540,dayEnd:1080});assert.equal(r.status,200);r=await request('redistribute','POST',{});check('Redistribuir con horario y sin sobrecarga',()=>{assert.ok(r.data.sessions.length);assert.ok(r.data.sessions.every(s=>s.start>=540&&s.start+s.hours*60<=1080));assert.equal(r.data.analysis.overloaded,0)});
 const refreshed=await request('state');check('Persistencia al consultar de nuevo',()=>assert.equal(refreshed.data.tasks[0].progress,50));
 r=await request('auth/register','POST',{name:'Otra cuenta QA',email:'qa-other-'+suffix+'@orbita.test',password});assert.equal(r.status,200);cookieB=r.cookie.split(';')[0];ids.push(r.data.user.id);r=await request('state','GET',undefined,cookieB);check('Aislamiento entre usuarios',()=>assert.equal(r.data.tasks.length,0));r=await request('tasks/'+task.id,'PUT',task,cookieB);assert.equal(r.status,404);
 r=await request('advice','POST',{question:'Explica el orden de trabajo y el tiempo disponible.'});check('IA real responde con Groq',()=>{assert.equal(r.status,200);assert.equal(r.data.source,'groq');assert.ok(r.data.text.length>50)});
 r=await request('state');check('Guardar historial de recomendaciones',()=>assert.equal(r.data.recommendations.length,1));check('Prioridad calculada persistida después de IA',()=>assert.ok(r.data.tasks[0].score>0));
 r=await request('tasks/'+task.id,'PUT',{...task,status:'completed',progress:100});check('Completar y excluir de horas pendientes',()=>{assert.equal(r.data.analysis.hours,0);assert.equal(r.data.analysis.pending,0)});
 r=await request('export');check('Exportar agenda sin contraseñas ni credenciales',()=>{assert.equal(r.data.version,1);assert.ok(!JSON.stringify(r.data).includes('password_hash'));assert.ok(!JSON.stringify(r.data).includes('GROQ_API_KEY'))});
 r=await request('auth/logout','POST',{});assert.equal(r.status,200);r=await request('state');check('Cerrar sesión invalida token',()=>assert.equal(r.data.user.demo,true));
 r=await request('auth/login','POST',{email,password:'incorrecta'});assert.equal(r.status,401);r=await request('auth/login','POST',{email,password});check('Inicio de sesión con validación',()=>assert.equal(r.status,200));cookieA=r.cookie.split(';')[0];
 r=await request('courses/'+course.id,'DELETE',{cascade:true});check('Eliminar curso con relaciones confirmadas',()=>{assert.equal(r.data.tasks.length,0);assert.equal(r.data.sessions.length,0);assert.equal(r.data.courses.length,0)});
 const originResult=await fetch(base+'/api/tasks',{method:'POST',headers:{Origin:'https://otro.example','Content-Type':'application/json'},body:'{}'});check('Bloquear origen externo',()=>assert.equal(originResult.status,403));
 console.log(JSON.stringify({checks,passed:checks.length,failed:0},null,2));await fs.writeFile('verification-api.json',JSON.stringify({date:new Date().toISOString(),base,checks,passed:checks.length,failed:0},null,2));
}finally{if(ids.length&&process.env.MYSQL_HOST){const con=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE,ssl:{ca:await fs.readFile(process.env.MYSQL_SSL_CA,'utf8'),rejectUnauthorized:true}});for(const id of ids)await con.execute('DELETE FROM users WHERE id=? AND email LIKE ?',[id,'qa-%@orbita.test']);await con.end()}}
