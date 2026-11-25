import test from 'node:test';
import assert from 'node:assert/strict';
import {backlogCsv,backlogExportRows} from '../src/backlog-export.mjs';
import {backlogColumns,sortBacklog,formatBacklogTimestamp} from '../src/backlog-columns.mjs';
import {filterBacklogRows} from '../src/backlog-filters.mjs';
const context={project:{code:'HS1'},items:[],sprints:[],releases:[]};
const columns=ids=>ids.map(id=>backlogColumns.find(c=>c.id===id));
test('export includes every filtered row in display order, not the rendered batch',()=>{
 const rows=Array.from({length:105},(_,i)=>({number:i+1,title:'工作 '+(i+1),owner:i>=60?'陈默':'我',points:i+1}));
 const filtered=filterBacklogRows(rows,{owner:['陈默']},context),sorted=sortBacklog(filtered,{key:'workItem',direction:'desc'},context);
 const matrix=backlogExportRows(sorted,columns(['workItem','owner','points']),context);
 assert.equal(matrix.length,46);assert.deepEqual(matrix[0],['工作项','负责人','故事点']);assert.deepEqual(matrix[1],['HS1-105 工作 105','陈默','105']);assert.deepEqual(matrix.at(-1),['HS1-61 工作 61','陈默','61']);
});
test('only visible columns are exported in their configured order with display values',()=>{
 const rows=[{number:1,title:'完整标题',priority:'high',points:0,kind:'task',owner:'',sprintId:'s',releaseId:'r',parentId:'p',updatedAt:'2026-11-25T01:02:03Z'}];
 const ctx={...context,items:[{id:'p',title:'父工作'}],sprints:[{id:'s',name:'冲刺一'}],releases:[{id:'r',name:'版本一'}]};
 assert.deepEqual(backlogExportRows(rows,columns(['workItem','points','owner','priority','parentId','sprintId','releaseId','updatedAt']),ctx)[1],['HS1-1 完整标题','0','未分配','高','父工作','冲刺一','版本一',formatBacklogTimestamp(rows[0].updatedAt)]);
 assert.deepEqual(backlogExportRows(rows,columns(['workItem','priority']),ctx)[0],['工作项','优先级']);
});
test('CSV preserves Chinese, quotes, commas and newlines and neutralizes spreadsheet formulas',()=>{
 const csv=backlogCsv([{number:1,title:'标题,"引号"\n换行',owner:' \t=1+1',points:0}],columns(['workItem','owner','points']),context);
 assert.equal(csv,'\ufeff"工作项","负责人","故事点"\r\n"HS1-1 标题,""引号""\n换行","\' \t=1+1","0"');
});
test('empty results have only the selected header, without hidden fields',()=>{
 assert.equal(backlogCsv([],columns(['workItem','owner']),context),'\ufeff"工作项","负责人"');
});
