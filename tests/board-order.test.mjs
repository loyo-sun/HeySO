import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore} from '../server/store.mjs';
import {sortBoardItems,boardInsertRank} from '../src/board-order.mjs';
test('board insertion places a card before, between and after visible cards',()=>{
 const rows=[{id:'a',number:1},{id:'b',number:10},{id:'c',number:20}];
 for(const [before,expected] of [['a',['x','a','b','c']],['b',['a','x','b','c']],[null,['a','b','c','x']]]){
 const x={id:'x',number:99,boardRank:boardInsertRank(rows,before)};assert.deepEqual(sortBoardItems([...rows,x]).map(i=>i.id),expected);
 }assert.equal(boardInsertRank([],null),0);
});
test('board rank is saved with a status transition and rejects non-finite positions',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heyso-board-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createStore(path.join(dir,'workspace.json'));
 store.dispatch({type:'item.update',payload:{id:'s4',status:'review',boardRank:1.5}});
 const item=store.read().items.find(i=>i.id==='s4');assert.equal(item.status,'review');assert.equal(item.boardRank,1.5);
 assert.throws(()=>store.dispatch({type:'item.update',payload:{id:'s4',boardRank:Infinity}}),/看板顺序/);
 assert.equal(createStore(path.join(dir,'workspace.json')).read().items.find(i=>i.id==='s4').boardRank,1.5);
});
