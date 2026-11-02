import {randomBytes,scrypt as rawScrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {saveToken,tokenUser,deleteToken} from './store.js';
const scrypt=promisify(rawScrypt);export const digest=x=>createHash('sha256').update(x).digest('hex');
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64);return salt+':'+hash.toString('hex')}
export async function checkPassword(password,stored){if(!stored)return false;const [salt,hash]=stored.split(':');const key=await scrypt(password,salt,64);const expected=Buffer.from(hash,'hex');return expected.length===key.length&&timingSafeEqual(expected,key)}
export function cookie(req){return (req.headers.cookie||'').match(/(?:^|;\s*)orbita_session=([a-f0-9]{64})/)?.[1]}
export async function identify(req){const token=cookie(req);return token?await tokenUser(digest(token)):null}
export async function login(res,userId){const token=randomBytes(32).toString('hex');await saveToken(digest(token),userId,Date.now()+7*86400000);res.append('Set-Cookie',`orbita_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${res.req?.secure?'; Secure':''}`)}
export async function logout(req,res){const token=cookie(req);if(token)await deleteToken(digest(token));res.setHeader('Set-Cookie',`orbita_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${res.req?.secure?'; Secure':''}`)}
