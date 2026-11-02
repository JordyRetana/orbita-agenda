import {randomUUID} from 'node:crypto';
import {taskInput,courseInput} from './validation.js';
import {validateSession} from './sessions.js';
import {getState,saveState,withUserLock,saveChatAction,getChatAction,finishChatAction} from './store.js';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const tool=(name,description,properties,required)=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
export const chatTools=[
 tool('create_course','Proponer un curso NUEVO solo si el usuario pide crearlo. Requiere confirmación.',{name:{type:'string'},code:{type:'string'},professor:{type:'string'}},['name']),
 tool('create_task','Proponer una actividad NUEVA solicitada por el usuario. Usar únicamente un courseId del contexto. Si falta título, curso, fecha de entrega o estimación de horas, preguntar antes. Requiere confirmación.',{title:{type:'string'},courseId:{type:'string'},due:{type:'string',description:'YYYY-MM-DD'},hours:{type:'number'},description:{type:'string'},type:{type:'string',enum:['Tarea','Proyecto','Examen','Presentación','Investigación','Lectura','Quiz','Otro']}},['title','courseId','due','hours']),
 tool('create_session','Proponer una sesión de estudio para una actividad EXISTENTE del usuario. Preguntar si falta fecha, hora o duración. Requiere confirmación.',{taskId:{type:'string'},date:{type:'string'},start:{type:'integer',description:'Minutos desde medianoche; 09:00 = 540'},hours:{type:'number'}},['taskId','date','start','hours'])
];
export function validateAction(kind,payload,state){
 if(kind==='create_course'){const course=courseInput(payload);if(state.courses.some(c=>c.name.trim().toLowerCase()===course.name.toLowerCase()))fail('Ya tienes ese curso.');return course}
 if(kind==='create_task'){if(!['title','courseId','due','hours'].every(k=>payload[k]!=null))fail('Faltan datos de la actividad.');return taskInput({...payload,progress:0,difficulty:3,importance:3,status:'pending'},state)}
 if(kind==='create_session')return validateSession(state,payload);
 fail('Esa operación no está disponible en el asistente.');
}
export async function proposeAction(kind,input,userId){
 return withUserLock(userId,async()=>{const state=await getState(userId),payload=validateAction(kind,input,state);const proposal={id:randomUUID(),kind,payload};await saveChatAction(proposal,userId);return {...proposal,courseName:state.courses.find(c=>c.id===payload.courseId)?.name,taskTitle:state.tasks.find(t=>t.id===payload.taskId)?.title,status:'pending'}});
}
export async function confirmAction(id,userId){
 return withUserLock(userId,async()=>{
  const action=await getChatAction(id,userId);if(!action)fail('Propuesta no encontrada en tu cuenta.',404);
  if(action.status==='applied')return {id:action.id,kind:action.kind,resultId:action.resultId,alreadyApplied:true};
  if(!action.fresh)fail('La propuesta venció. Pídele al asistente que la prepare otra vez.',409);
  const state=await getState(userId),payload=validateAction(action.kind,action.payload,state),resultId=randomUUID();
  if(action.kind==='create_course')state.courses.push({id:resultId,...payload});
  if(action.kind==='create_task')state.tasks.push({id:resultId,...payload,createdAt:new Date().toISOString()});
  if(action.kind==='create_session')state.sessions.push({id:resultId,...payload});
  await saveState(state,userId);await finishChatAction(id,userId,resultId);
  return {id:action.id,kind:action.kind,resultId};
 });
}
