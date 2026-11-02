import test from 'node:test';
import assert from 'node:assert/strict';
import {Planner,scoreTask,remaining} from '../server/planner.js';
const base={id:'a',title:'Proyecto',due:'2026-10-22',hours:6,progress:0,difficulty:4,importance:4,status:'pending'};
test('una entrega más cercana incrementa la prioridad',()=>{assert.ok(scoreTask({...base,due:'2026-10-21'},[base],'2026-10-20').score>scoreTask({...base,due:'2026-10-29'},[base],'2026-10-20').score)});
test('completadas no suman horas ni prioridad',()=>{const t={...base,status:'completed'};assert.equal(remaining(t),0);assert.equal(scoreTask(t,[t],'2026-10-20').score,0)});
test('redistribuir respeta capacidad y entrega; informa trabajo sin espacio',()=>{const state={capacity:2,tasks:[{...base,due:'2026-10-21'}],sessions:[]};const sessions=new Planner(state).redistribute('2026-10-20');assert.equal(sessions.reduce((n,s)=>n+s.hours,0),4);assert.ok(sessions.every(s=>s.date<=base.due&&s.hours<=2));const report=new Planner({...state,sessions}).analyze('2026-10-20');assert.equal(report.overloaded,0);assert.deepEqual(report.risks,['a'])});
test('análisis detecta sobrecarga y no muta datos',()=>{const state={capacity:2,tasks:[base],sessions:[{id:'s',taskId:'a',date:'2026-10-20',hours:3}]};const before=JSON.stringify(state);assert.equal(new Planner(state).analyze('2026-10-20').overloaded,1);assert.equal(JSON.stringify(state),before)});
