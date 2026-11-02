import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import {createApi} from './api.js';
import {initStore} from './store.js';
const storage=await initStore(),app=createApi({storage});
if(fs.existsSync('dist/index.html')){app.use(express.static('dist',{setHeaders:(res,file)=>{if(file.endsWith('index.html')||file.endsWith('sw.js'))res.setHeader('Cache-Control','no-cache')}}));app.get('/{*path}',(req,res)=>res.sendFile(path.resolve('dist/index.html')))}else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares)}
const port=Number(process.env.PORT||4173);app.listen(port,'127.0.0.1',()=>console.log(`Órbita: http://127.0.0.1:${port} · almacenamiento: ${storage}`));
