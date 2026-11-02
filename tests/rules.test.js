import test from 'node:test';
import assert from 'node:assert/strict';
import {infer} from '../server/rules.js';
test('inferencia deriva una recomendación en dos pasos',()=>{const r=infer({days:1,progress:20,remaining:5,importance:5});assert.equal(r.facts.startToday,true);assert.deepEqual(r.fired,['deadline-risk','high-impact-risk'])});
test('la carga se compara con la capacidad del estudiante',()=>{assert.equal(infer({plannedHours:5,capacity:4}).facts.overload,true);assert.equal(infer({plannedHours:3,capacity:4}).facts.overload,undefined)});
