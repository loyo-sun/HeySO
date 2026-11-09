import {performance} from 'node:perf_hooks';
import {projectPending} from '../src/durable-workspace-sync.mjs';
const state={projects:[{id:'p'}],items:Array.from({length:2000},(_,i)=>({id:'i'+i,projectId:'p',title:'Item '+i,description:'context '.repeat(60)})),events:[],notes:[],runs:[],sprints:[],releases:[]};
const queue=[{type:'item.update',payload:{id:'i1000',title:'edited'}}],iterations=100;
function measure(fn){const start=performance.now();for(let i=0;i<iterations;i++)fn();return +(performance.now()-start).toFixed(2);}
const baselineMs=measure(()=>{const next=structuredClone(state);next.items.find(i=>i.id==='i1000').title='edited';});
const candidateMs=measure(()=>projectPending(state,queue));
console.log(JSON.stringify({scenario:'front-end optimistic projection only',items:state.items.length,iterations,baselineMs,candidateMs,notes:'Microbenchmark; excludes browser rendering, IndexedDB, network and production database. Not an end-to-end performance claim.'},null,2));
