import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSession} from '../server/sessions.js';
import {todayISO,datePlus} from '../server/planner.js';
const date=todayISO();
const state={tasks:[{id:'t',status:'pending',due:datePlus(date,4)}],sessions:[{id:'s',taskId:'t',date,start:600,hours:1}]};
test('permite sesiones contiguas y bloquea cruces',()=>{assert.equal(validateSession(state,{taskId:'t',date,start:660,hours:1}).start,660);assert.throws(()=>validateSession(state,{taskId:'t',date,start:630,hours:1}),/horario/)});
test('no permite sesiones fuera del día o después de entrega',()=>{assert.throws(()=>validateSession(state,{taskId:'t',date,start:1300,hours:1}));assert.throws(()=>validateSession(state,{taskId:'t',date:datePlus(date,5),start:700,hours:1}));assert.throws(()=>validateSession(state,{taskId:'t',date,start:NaN,hours:1}))});
test('permite editar la misma sesión sin colisión consigo misma',()=>assert.equal(validateSession(state,{taskId:'t',date,start:600,hours:1},'s').hours,1));
