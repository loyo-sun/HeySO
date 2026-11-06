import {useCallback,useEffect,useSyncExternalStore} from 'react';
import {ViewPreferencesStore} from './view-preferences.mjs';
export const viewPreferences=new ViewPreferencesStore();
export default function useViewPreferences(project,view,defaults){
 const record=viewPreferences.record(project,view,defaults);
 const subscribe=useCallback(listener=>viewPreferences.subscribe(record,listener),[record]);
 const snapshot=useCallback(()=>record.values,[record]);
 const values=useSyncExternalStore(subscribe,snapshot,snapshot);
 useEffect(()=>{viewPreferences.connect(record);const refresh=()=>viewPreferences.connect(record,true);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};},[record]);
 return {values,set:patch=>viewPreferences.update(record,patch),field:key=>[values[key],next=>viewPreferences.update(record,previous=>({[key]:typeof next==='function'?next(previous[key]):next}))]};
}
export function ViewPreferencesNotice({project}){
 useViewPreferences(project,'board',{});const record=viewPreferences.record(project,'board',{});
 useSyncExternalStore(useCallback(fn=>viewPreferences.subscribeStatus(fn),[]),()=>viewPreferences.statusVersion,()=>0);
 const error=viewPreferences.projectError(record.projectKey);
 return !error?null:<button type="button" className="view-preferences-notice" role="status" onClick={()=>viewPreferences.retryProject(record.projectKey)}>个人筛选尚未同步，点击重试</button>;
}
