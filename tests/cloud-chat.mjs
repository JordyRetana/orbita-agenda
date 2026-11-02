import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_URL||'https://orbita-agenda.jretanamendez.workers.dev';
let user,cookie;const checks=[];
try{
 const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Prueba de chat',email:'qa-'+randomUUID()+'@orbita.test',password:randomUUID()})});
 assert.equal(r.status,200);const data=await r.json();user=data.user.id;cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(r.headers.get('set-cookie').includes('Secure'));checks.push('Cookie de sesión segura');
 async function chat(question,history=[]){const start=performance.now();let first,answer='',done=false,deltaCount=0;const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({question,history})});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {done:ended,value}=await reader.read();if(ended)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line.startsWith('data:'))continue;const event=JSON.parse(line.slice(5));assert.notEqual(event.type,'error',event.message);if(event.type==='delta'){first??=performance.now()-start;answer+=event.text;deltaCount++}if(event.type==='done')done=true}}assert.ok(done);assert.ok(answer.length>10);assert.ok(deltaCount>1);return {answer,firstTokenMs:Math.round(first),totalMs:Math.round(performance.now()-start),deltaCount}}
 const initial='Mi sesión favorita se llama NARANJA-47. ¿Puedes recordarla?';const a=await chat(initial);checks.push('Respuesta progresiva real');
 const b=await chat('¿Cómo se llama la sesión que te acabo de decir?',[{role:'user',content:initial},{role:'assistant',content:a.answer}]);assert.match(b.answer,/NARANJA[-\u2010-\u2015]47/i);checks.push('Contexto de conversación conservado');
 const state=await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.recommendations.length,2);checks.push('Conversación guardada en MySQL');
 const denied=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'Hola'})});assert.equal(denied.status,401);checks.push('IA protegida para cuentas personales');
 const report={date:new Date().toISOString(),base,checks,timing:[{firstTokenMs:a.firstTokenMs,totalMs:a.totalMs,deltaCount:a.deltaCount},{firstTokenMs:b.firstTokenMs,totalMs:b.totalMs,deltaCount:b.deltaCount}]};console.log(JSON.stringify(report,null,2));await fs.writeFile('verification/cloud-chat.json',JSON.stringify(report,null,2));
}finally{if(user){const con=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE,ssl:{ca:await fs.readFile(process.env.MYSQL_SSL_CA,'utf8'),rejectUnauthorized:true}});await con.execute('DELETE FROM users WHERE id=? AND email LIKE ?',[user,'qa-%@orbita.test']);await con.end()}}

