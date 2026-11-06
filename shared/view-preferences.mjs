// Personal view state only: never include workspace records, credentials or document heads.
export const viewPreferenceKeys={
 roadmap:['query','status','owner','version','scale','anchor','top','bottom','fields','showReleases','barLabels','colorBy','custom','collapsed'],
 backlog:['query','history','showSubtasks','versionsOpen','versionFilter','backlogExpanded','expandedSprints'],
 board:['query','status','owner','sprint','release','showSubtasks'],
 list:['query','filters','columns','sort'],
 releases:['query','filter','tab'],
 reports:['report','owner','kind','release','unit','group','scope','aiScope','dateField','from','to','sprintId','directoryCategory','directoryQuery','favorites','recent'],
};
const columns=['workItem','status','priority','owner','points','kind','parentId','startDate','endDate','sprintId','releaseId','createdAt','updatedAt'];
const enums={scale:['quarter','year','fit','custom'],colorBy:['type','status'],filter:['unreleased','released','all','archived'],tab:['items','notes'],unit:['points','count'],group:['status','kind','priority','owner','releaseId','sprintId'],scope:['current','done','unfinished','added','removed'],aiScope:['period','pending'],dateField:['createdAt','updatedAt','endDate','completedAt']};
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const string=v=>typeof v==='string'&&v.length<=1000;
const ids=v=>Array.isArray(v)&&v.length<=1000&&v.every(s=>typeof s==='string'&&s.length<=200);
const date=v=>typeof v==='string'&&(v===''||/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(new Date(v+'T12:00:00').getTime()));
function valid(key,value){
 if(['history','showSubtasks','versionsOpen','backlogExpanded','showReleases','barLabels'].includes(key))return typeof value==='boolean';
 if(['top','bottom'].includes(key))return value===null||Number.isInteger(value)&&value>=-1&&value<=100;
 if(['anchor','from','to'].includes(key))return date(value);
 if(enums[key])return enums[key].includes(value);
 if(['fields','columns'].includes(key))return ids(value)&&value.every(v=>columns.includes(v));
 if(['collapsed','favorites','recent'].includes(key))return ids(value);
 if(['status','owner','version'].includes(key))return string(value)||ids(value);
 if(key==='custom')return plain(value)&&Object.keys(value).every(k=>['startDate','endDate'].includes(k))&&date(value.startDate)&&date(value.endDate);
 if(key==='expandedSprints')return plain(value)&&Object.keys(value).length<=1000&&Object.entries(value).every(([id,v])=>/^[\w-]{1,200}$/.test(id)&&typeof v==='boolean');
 if(key==='sort')return plain(value)&&columns.includes(value.key)&&['asc','desc'].includes(value.direction)&&Object.keys(value).every(k=>['key','direction'].includes(k));
 if(key==='filters')return plain(value)&&Object.entries(value).every(([id,v])=>columns.includes(id)&&(ids(v)||string(v)||plain(v)&&Object.keys(v).every(k=>['from','to'].includes(k))&&Object.values(v).every(s=>typeof s==='string'&&s.length<=40)));
 return string(value);
}
export function normalizeViewPatch(view,patch,{strict=false}={}){
 if(!viewPreferenceKeys[view]||!plain(patch)||JSON.stringify(patch).length>32768){if(strict)throw Error('个人视图配置格式无效或内容过大');return {};}
 const out={};
 for(const [key,value] of Object.entries(patch)){
  if(!viewPreferenceKeys[view].includes(key)||!valid(key,value)){if(strict)throw Error('不支持的个人视图配置：'+key);continue;}
  out[key]=structuredClone(value);
 }
 return out;
}
