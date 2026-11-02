import test from 'node:test';
import assert from 'node:assert/strict';
import {claimsSaved} from '../server/chat-safety.js';
import {validateAction} from '../server/chat-actions.js';
const state={courses:[{id:'own-course',name:'Mi curso'}],tasks:[],sessions:[]};
test('bloquea afirmaciones de guardado sin recibo de base de datos',()=>{for(const text of ['He agregado la actividad.','Ya creé el curso.','La tarea quedó guardada.','La actividad fue creada.','Agregué tu tarea.','La sesión ha sido programada.'])assert.ok(claimsSaved(text),text);assert.equal(claimsSaved('Revisa la propuesta antes de guardarla.'),false)});
test('una herramienta no puede referenciar cursos de otra cuenta',()=>{assert.throws(()=>validateAction('create_task',{title:'Informe',courseId:'foreign-course',due:'2026-12-01',hours:2},state),/curso válido/)});
test('rechaza operaciones no permitidas y actividades sin datos necesarios',()=>{assert.throws(()=>validateAction('delete_user',{},state),/no está disponible/);assert.throws(()=>validateAction('create_task',{title:'Sin detalles'},state),/Faltan datos/)});
