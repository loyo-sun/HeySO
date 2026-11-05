import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {sortSprintItems,sprintInsertRank} from '../src/sprint-order.mjs';
test('sprint insertion ranks place work before, between and after rows',()=>{
 const rows=[{id:'a',number:1},{id:'b',number:10}];
 for(const [before,order] of [['a',['x','a','b']],['b',['a','x','b']],[null,['a','b','x']]])assert.deepEqual(sortSprintItems([...rows,{id:'x',number:99,sprintRank:sprintInsertRank(rows,before)}]).map(i=>i.id),order);
 assert.equal(sprintInsertRank([],null),0);
});
test('sprint order persists across reload and cross-sprint moves without changing board order',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-sprint-order-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const filename=path.join(dir,'workspace.json'),store=createStore(filename);
 store.dispatch({type:'item.update',payload:{id:'s5',sprintId:'sp1',sprintRank:0,boardRank:8}});
 let saved=createStore(filename).read().items.find(i=>i.id==='s5');assert.equal(saved.sprintRank,0);assert.equal(saved.boardRank,8);
 store.dispatch({type:'item.update',payload:{id:'s5',sprintId:'sp2',sprintRank:1.5}});saved=createStore(filename).read().items.find(i=>i.id==='s5');assert.equal(saved.sprintId,'sp2');assert.equal(saved.sprintRank,1.5);assert.equal(saved.boardRank,8);
 assert.throws(()=>store.dispatch({type:'item.update',payload:{id:'s5',sprintRank:Infinity}}),/冲刺顺序/);
});
