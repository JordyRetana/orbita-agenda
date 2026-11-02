import {todayISO} from './planner.js';
export function validateSession(state,input,ignoreId){
 const task=state.tasks.find(t=>t.id===input.taskId);
 const fail=message=>{const e=new Error(message);e.status=400;throw e};
 if(!task||task.status==='completed')fail('Selecciona una actividad pendiente.');
 const {date}=input,start=Number(input.start),hours=Number(input.hours);
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail('Fecha inválida.');
 if(date<todayISO()||date>task.due)fail('Elige una fecha entre hoy y la entrega.');
 if(!Number.isFinite(start)||!Number.isInteger(start)||start<480||!Number.isFinite(hours)||hours<.25||start+hours*60>1320)fail('La sesión debe durar al menos 15 minutos y quedar entre 08:00 y 22:00.');
 let cursor=540;
 const existing=state.sessions.filter(s=>s.date===date).map(s=>{const positioned={...s,start:s.start??cursor};cursor=Math.max(cursor,positioned.start+s.hours*60+15);return positioned});
 if(existing.some(s=>s.id!==ignoreId&&state.tasks.some(t=>t.id===s.taskId&&t.status!=='completed')&&start<s.start+s.hours*60&&start+hours*60>s.start))fail('Ese horario ya tiene una sesión. Elige otro espacio.');
 return {taskId:task.id,date,start,hours};
}
