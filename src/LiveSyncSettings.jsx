import React,{useState} from 'react';
import {ReplicaButton,ReplicaModal} from './ReplicaControls.jsx';
export default function LiveSyncSettings({sync,status,configure}){
 const [review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function inspect(id){setBusy(true);setError('');try{setReview(await sync.inspectFailed(id));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function resolve(keep){setBusy(true);setError('');try{await sync.resolveFailed(review.id,keep);setReview(null);}catch(e){setError(e.message);}finally{setBusy(false);}}
 const item=review?.state.items.find(i=>i.id===review.entry.payload.id);
 return <section className="settings-section" aria-label="保存与草稿">
  <h3>保存与草稿</h3><p>正常操作自动保存到服务器。未提交操作：{sync.queue.length}；需要处理的草稿：{sync.failed.length}。</p>
  {status.error&&<p role="status">{status.error}</p>}
  {['retrying','storage-error','pending'].includes(status.phase)&&<ReplicaButton onClick={()=>sync.retry().catch(e=>setError(e.message))}>重试保存</ReplicaButton>}
  {status.phase==='expired'&&<ReplicaButton onClick={configure}>重新连接</ReplicaButton>}
  {sync.failed.map(entry=><div key={entry.id}><p>{entry.type}：{entry.error}</p><ReplicaButton disabled={busy} onClick={()=>inspect(entry.id)}>查看保留的草稿</ReplicaButton></div>)}
  {error&&<p role="alert">{error}</p>}
  {review&&<div className="replica-dialog-host"><ReplicaModal className="modal sync-review-modal" open onCancel={()=>setReview(null)}>
   <header><h2>处理未保存草稿</h2></header><div className="modal-body"><p>{review.entry.error}</p>
   <h3>本地提交内容</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(review.entry.payload,null,2)}</pre>
   <h3>当前服务器内容</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(item||{message:'此操作不对应单个工作项，请核对操作类型'},null,2)}</pre>{error&&<p role="alert">{error}</p>}</div>
   <footer><ReplicaButton onClick={()=>setReview(null)}>暂不处理</ReplicaButton><ReplicaButton disabled={busy} onClick={()=>resolve(false)}>撤回草稿</ReplicaButton><ReplicaButton className="primary" disabled={busy} onClick={()=>resolve(true)}>重新提交草稿</ReplicaButton></footer>
  </ReplicaModal></div>}
 </section>;
}
