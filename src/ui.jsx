import React,{useEffect,useRef} from 'react';
import {CalendarDays,CheckSquare2,BookOpen,ChartNoAxesColumn,Plus,Search,Clock,Flag,ChevronRight,ChevronLeft,Settings,Check,Calendar,Trash2,X,Sparkles,Download,Play,Pause,RotateCcw,LogOut,UserRound,WifiOff,GripVertical,Database,ArrowUpRight,ArrowRight} from 'lucide-react';
export {CalendarDays,CheckSquare2,BookOpen,ChartNoAxesColumn,Plus,Search,Clock,Flag,ChevronRight,ChevronLeft,Settings,Check,Calendar,Trash2,X,Sparkles,Download,Play,Pause,RotateCcw,LogOut,UserRound,WifiOff,GripVertical,Database,ArrowUpRight,ArrowRight};
export const format=n=>new Intl.NumberFormat('es-CR',{maximumFractionDigits:2}).format(n);
export const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const dateText=(iso,options={day:'numeric',month:'short'})=>new Date(iso+'T12:00:00Z').toLocaleDateString('es-CR',{timeZone:'America/Costa_Rica',...options});
export const timeText=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.round(n%60)).padStart(2,'0')}`;
export const toMinutes=s=>{const[h,m]=s.split(':').map(Number);return h*60+m};
export const initials=name=>(name||'Estudiante').split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase();
export const Monday=iso=>addDays(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));
export function IconButton({label,children,...props}){return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>}
export function Segment({options,value,onChange,label}){return <div className="segment" role="group" aria-label={label}>{options.map(x=><button type="button" key={x} aria-pressed={value===x} className={value===x?'selected':''} onClick={()=>onChange(x)}>{x}</button>)}</div>}
export function Modal({title,onClose,children,className=''}){
 const ref=useRef();useEffect(()=>{const previous=document.activeElement;const el=ref.current;el?.querySelector('input:not([type=hidden]),select,textarea,button')?.focus();const key=e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const controls=[...el.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.disabled&&x.offsetParent!==null);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()}},[]);
 return <div className="modal-backdrop" onClick={onClose}><section ref={ref} className={'modal '+className} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><div className="modal-heading"><h2>{title}</h2><IconButton label="Cerrar" onClick={onClose}><X size={21}/></IconButton></div>{children}</section></div>
}
export function CourseIcon({color='#007aff',size=18}){return <span className="course-icon" style={{'--color':color}}><BookOpen size={size}/></span>}
export function AdviceText({text}){
 const lines=text.split('\n'),blocks=[];const clean=s=>s.replace(/\*\*/g,'');
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();if(!line)continue;
  if(line.startsWith('|')){const rows=[];while(i<lines.length&&lines[i].trim().startsWith('|')){const l=lines[i].trim();if(!/^\|[\s:|\-]+\|$/.test(l))rows.push(l.replace(/^\||\|$/g,'').split('|').map(x=>clean(x.trim())));i++}i--;if(rows.length)blocks.push(<div className="ai-table" key={i}><table><thead><tr>{rows[0].map((x,j)=><th key={j}>{x}</th>)}</tr></thead><tbody>{rows.slice(1).map((r,j)=><tr key={j}>{r.map((x,k)=><td key={k}>{x}</td>)}</tr>)}</tbody></table></div>)}
  else blocks.push(<p key={i}>{clean(line)}</p>);
 }
 return <div className="ai-text">{blocks}</div>
}
