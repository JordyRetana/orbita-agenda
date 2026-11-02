export const academicRules=[
 {id:'deadline-risk',when:[['days','<=',1],['progress','<',50],['remaining','>',0]],then:{deadlineRisk:true}},
 {id:'high-impact-risk',when:[['deadlineRisk','=',true],['importance','>=',4]],then:{startToday:true}},
 {id:'daily-overload',when:[['plannedHours','>',{fact:'capacity'}]],then:{overload:true}},
 {id:'weekly-overload',when:[['demandHours','>',{fact:'weeklyCapacity'}]],then:{overload:true}},
 {id:'exam-concentration',when:[['exams','>=',2],['importantActivities','>=',5]],then:{concentrated:true}},
 {id:'work-not-scheduled',when:[['unscheduled','>',0]],then:{needsPlanning:true}}
];
export function infer(facts,rules=academicRules){
 const result={...facts},fired=[];let changed=true;
 const compare=(a,op,b)=>op==='='?a===b:op==='>'?a>b:op==='>='?a>=b:op==='<'?a<b:op==='<='?a<=b:false;
 while(changed){changed=false;for(const r of rules){if(fired.includes(r.id))continue;if(r.when.every(([key,op,value])=>compare(result[key],op,value&&typeof value==='object'?result[value.fact]:value))){Object.assign(result,r.then);fired.push(r.id);changed=true}}}
 return {facts:result,fired};
}
