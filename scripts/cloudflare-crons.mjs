import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','auth','token','--json'],{encoding:'utf8'});
if(r.status)throw Error('No se pudo autenticar Wrangler');
const credentials=JSON.parse(r.stdout),token=credentials.token;
if(!token)throw Error('No se recibió una credencial de Cloudflare');
const base='https://api.cloudflare.com/client/v4/accounts/1f3ced9721f8add504ae942fc9c16fa6/workers/scripts';
const headers={Authorization:'Bearer '+token};
if(process.argv.includes('--replace-saldo-with-orbita')){
 for(const [worker,schedules] of [['saldo-pwa-cron',[]],['orbita-agenda',[{cron:'*/10 * * * *'}]]]){
  const d=await (await fetch(base+'/'+worker+'/schedules',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(schedules)})).json();
  if(!d.success)throw Error('No se pudo actualizar '+worker+': '+JSON.stringify(d.errors));
  console.log('Horario actualizado: '+worker);
 }
}
const data=await (await fetch(base,{headers})).json();if(!data.success)throw Error('No se pudo listar Workers');
const schedules=await Promise.all(data.result.map(async w=>{const d=await (await fetch(base+'/'+encodeURIComponent(w.id)+'/schedules',{headers})).json();if(!d.success)throw Error('No se pudo leer cron de '+w.id);return {worker:w.id,schedules:d.result.schedules||d.result}}));
console.log(JSON.stringify(schedules.filter(x=>x.schedules.length),null,2));

