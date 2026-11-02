import {infer} from './rules.js';
export const remaining=t=>t.status==='completed'?0:Math.round(t.hours*(1-t.progress/100)*100)/100;
export const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());
export function datePlus(iso,days){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function scoreTask(task,all,now=todayISO()){
 const days=Math.ceil((Date.parse(task.due+'T12:00:00Z')-Date.parse(now+'T12:00:00Z'))/86400000);
 const upcoming=all.filter(t=>t.status!=='completed'&&t.due>=now&&t.due<=datePlus(now,7));
 const factors=[{label:'Cercanía de entrega',value:days<=0?35:days===1?32:days<=3?26:days<=7?18:8,max:35},{label:'Importancia',value:task.importance*4,max:20},{label:'Dificultad',value:task.difficulty*3,max:15},{label:'Trabajo pendiente',value:Math.min(15,Math.round(remaining(task)*3)),max:15},{label:'Avance pendiente',value:Math.round((100-task.progress)/10),max:10},{label:'Carga de los próximos 7 días',value:Math.min(5,upcoming.length),max:5}];
 const score=task.status==='completed'?0:Math.min(100,factors.reduce((s,f)=>s+f.value,0));
 return {...task,remaining:remaining(task),days,score,factors,level:score>=80?'Urgente':score>=65?'Alta':score>=40?'Media':'Baja',explanation:task.status==='completed'?'Actividad completada.':`${days<0?'La entrega está vencida':days===0?'Vence hoy':days===1?'Vence mañana':`Vence en ${days} días`}; quedan ${remaining(task)} h de trabajo y llevas ${task.progress} % de avance. Importancia ${task.importance}/5 y dificultad ${task.difficulty}/5.`};
}
export class Planner{
 constructor(state){this.state=state}
 analyze(now=todayISO()){
  const tasks=this.state.tasks.map(t=>scoreTask(t,this.state.tasks,now)).sort((a,b)=>b.score-a.score||a.due.localeCompare(b.due));
  const days=Array.from({length:7},(_,i)=>{const date=datePlus(now,i);const sessions=this.state.sessions.filter(s=>s.date===date&&tasks.some(t=>t.id===s.taskId&&t.status!=='completed'));const hours=sessions.reduce((s,x)=>s+x.hours,0);return {date,hours:Math.round(hours*10)/10,capacity:this.state.capacity,level:hours>this.state.capacity?'Sobrecarga':hours>this.state.capacity*.8?'Alta':hours>this.state.capacity*.5?'Moderada':'Baja',sessions}});
  const pending=tasks.filter(t=>t.status!=='completed');
  const risks=pending.filter(t=>t.due<=datePlus(now,6)&&this.state.sessions.filter(s=>s.taskId===t.id&&s.date>=now&&s.date<=t.due).reduce((n,s)=>n+s.hours,0)+.01<t.remaining);
  const upcoming=pending.filter(t=>t.due>=now&&t.due<=datePlus(now,6));
  const weekly=infer({demandHours:upcoming.reduce((n,t)=>n+t.remaining,0),weeklyCapacity:this.state.capacity*7,exams:upcoming.filter(t=>t.type==='Examen').length,importantActivities:upcoming.filter(t=>t.importance>=4).length,unscheduled:risks.length});
  return {tasks,days,risks:risks.map(t=>t.id),pending:pending.length,completed:tasks.length-pending.length,hours:Math.round(pending.reduce((s,t)=>s+t.remaining,0)*100)/100,overloaded:days.filter(d=>d.hours>d.capacity).length,weekly:{...weekly.facts,rules:weekly.fired},recommendations:pending.map(t=>({taskId:t.id,priority:t.score,explanation:t.explanation,rules:infer({...t}).fired}))};
 }
 redistribute(now=todayISO()){
  const analysis=this.analyze(now);const load=Array(7).fill(0);const sessions=[];let serial=0;
  const dayStart=this.state.dayStart??540,dayEnd=this.state.dayEnd??1080;
  for(const t of analysis.tasks.filter(t=>t.status!=='completed')){
   let hours=t.remaining;const deadline=Math.min(6,Math.floor((Date.parse(t.due+'T12:00:00Z')-Date.parse(now+'T12:00:00Z'))/86400000));
   for(let day=0;day<=deadline&&hours>.01;day++){
    let start=dayStart;const daySessions=sessions.filter(s=>s.date===datePlus(now,day));if(daySessions.length)start=Math.max(...daySessions.map(s=>s.start+s.hours*60))+15;
    const available=Math.max(0,Math.min(this.state.capacity-load[day],(dayEnd-start)/60));
    const amount=Math.min(hours,available);if(amount>=.25){const h=Math.floor(amount*100)/100;sessions.push({id:'auto-'+serial++,taskId:t.id,date:datePlus(now,day),start,hours:h});load[day]+=h;hours=Math.max(0,hours-h)}
   }
  }
  return sessions;
 }
}
