import React,{useState} from 'react';
import {Cloud,RefreshCw,AlertCircle,CheckCircle2} from 'lucide-react';
import {ReplicaButton,ReplicaModal} from './ReplicaControls.jsx';
const fields={title:'标题',description:'描述',acceptance:'验收标准',status:'状态',owner:'负责人',startDate:'开始日期',endDate:'结束日期',dueDate:'截止日期',priority:'优先级',points:'故事点',parentId:'所属工作项',kind:'工作类型',sprintId:'冲刺',releaseId:'版本',aiEnabled:'AI 执行',aiDisabled:'停用 AI'};
const text=value=>value===undefined?'—':value===null?'未设置':typeof value==='boolean'?(value?'是':'否'):String(value);
export default function SyncNotice({sync,status,configure}) {
  const [review,setReview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!status||status.phase==='loading')return null;
  const blocked=['conflict','rejected','expired','storage-error','locked'].includes(status.phase);
  const retrying=status.phase==='retrying';
  const message=({'saving-local':'正在保存到本地…',synced:'已同步到云端',syncing:'正在同步云端…',pending:'已保存到本地，等待同步云端',retrying:'云端同步失败，正在重试',conflict:'云端内容已有更新，请核对后处理',rejected:'云端未接受修改，请核对后处理',expired:'登录已失效，请重新连接原账号', 'storage-error':'本地保存未完成，请勿关闭页面',locked:'此页面只读：另一个页面正在同步'})[status.phase]||'修改尚未同步';
  async function inspect(){setBusy(true);setError('');try{setReview(await sync.inspect());}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function resolve(keep){setBusy(true);try{if(await sync.resolveFirst(keep))setReview(null);}catch(e){setError('本地保存失败，请重试');}finally{setBusy(false);}}
  const entry=sync.queue?.[0],item=review?.state.items.find(i=>i.id===entry?.payload.id);
  return <>
    <aside className={`cloud-sync-notice ${blocked?'blocked':''} ${status.phase==='synced'?'synced':''}`} role="status" aria-live="polite" aria-label="云端同步状态">
      {blocked?<AlertCircle size={18}/>:status.phase==='synced'?<CheckCircle2 size={18}/>:<Cloud size={18}/>}
      <div><strong>{message}</strong>{status.count>0&&<small>{status.count} 项操作待同步{status.localSaved?' · 已保存在本地':''}</small>}{status.error&&<small>{status.error}</small>}{error&&<small role="alert">{error}</small>}</div>
      {['retrying','pending','storage-error'].includes(status.phase)&&<ReplicaButton className="text-btn" onClick={()=>sync.retry().catch(e=>setError(e.message))}><RefreshCw size={14}/>立即重试</ReplicaButton>}
      {['conflict','rejected'].includes(status.phase)&&<ReplicaButton disabled={busy} onClick={inspect}>核对修改</ReplicaButton>}
      {status.phase==='expired'&&<ReplicaButton onClick={configure}>重新连接</ReplicaButton>}
    </aside>
    {review&&<div className="replica-dialog-host"><ReplicaModal className="modal sync-review-modal" open onCancel={()=>setReview(null)} role="dialog" aria-modal="true" aria-labelledby="sync-review-title">
      <header><h2 id="sync-review-title">核对未同步修改</h2><ReplicaButton aria-label="关闭核对" onClick={()=>setReview(null)}>关闭</ReplicaButton></header>
      <div className="modal-body"><p>{item?.title||'该操作'}：{entry?.error}</p><p>云端仍会检查权限、版本与工作流规则。重新提交后若发生并发更新，将再次提示。</p>
        <table><thead><tr><th>字段</th><th>本地待提交</th><th>当前云端</th></tr></thead><tbody>{Object.entries(entry?.payload||{}).filter(([key])=>fields[key]).map(([key,value])=><tr key={key}><th>{fields[key]}</th><td>{text(value)}</td><td>{text(item?.[key])}</td></tr>)}</tbody></table>
        {error&&<p role="alert">{error}</p>}
      </div><footer><ReplicaButton onClick={()=>setReview(null)}>暂不处理</ReplicaButton><ReplicaButton disabled={busy} onClick={()=>resolve(false)}>采用云端，撤回本次修改</ReplicaButton><ReplicaButton className="primary" disabled={busy} onClick={()=>resolve(true)}>重新提交本地修改</ReplicaButton></footer>
    </ReplicaModal></div>}
  </>;
}
