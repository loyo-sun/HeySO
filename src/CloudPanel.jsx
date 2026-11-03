import React,{useEffect,useState,useRef} from 'react';
import {Cloud,RefreshCw,Download,Upload} from 'lucide-react';
async function api(url,body){const r=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-HeySO-Client':'local-ui'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'云操作失败');return d;}
export default function CloudPanel({project,busy,onState,setToast}){
  const [status,setStatus]=useState(null),[working,setWorking]=useState(false),[error,setError]=useState(''),[files,setFiles]=useState(null);
  const opening=useRef(false),flow=useRef(null),popup=useRef(null),onStateRef=useRef(onState);onStateRef.current=onState;
  async function refresh(){setStatus(await api('/api/cloud/status'));}
  useEffect(()=>{refresh().catch(e=>setError(e.message));return()=>{flow.current=null;};},[]);
  useEffect(()=>{
    const fileId=new URLSearchParams(window.location.search).get('cloudFile');
    if(status?.connected&&fileId&&!opening.current){opening.current=true;run(async()=>{
      const result=await api('/api/cloud/open',{fileId});onStateRef.current(result);
      const url=new URL(window.location.href);url.searchParams.delete('cloudFile');history.replaceState(null,'',url);
    }).finally(()=>{opening.current=false;});}
  },[status?.connected]);
  async function convert(id){const state=await api('/api/state');const result=await api('/api/cloud/convert',{projectId:id,revision:state.revision});onStateRef.current(result);setToast('已转为在线项目，保存到 LoyoCloud 云空间');}
  useEffect(()=>{
    async function receive(event){const current=flow.current;if(!current||event.source!==popup.current||event.origin!==current.base||event.data?.type!=='loyocloud_connected'||event.data.state!==current.state)return;
      flow.current=null;setWorking(true);setError('');
      try{setStatus(await api('/api/cloud/exchange',{code:event.data.code,state:event.data.state}));if(current.convertId)await convert(current.convertId);else setToast('HeySO 已连接 LoyoCloud');}
      catch(e){setError(e.message);}finally{setWorking(false);popup.current?.close();}
    }
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[]);
  async function login(convertId){
    popup.current=window.open('about:blank','heyso-cloud-login','width=640,height=760');
    if(!popup.current){setError('请允许弹出登录窗口后重试');return;}
    setError('');setWorking(true);
    try{const next=await api('/api/cloud/connect',{});flow.current={...next,convertId};popup.current.location.href=next.url;}
    catch(e){popup.current?.close();setError(e.message);}finally{setWorking(false);}
  }
  async function run(fn){setWorking(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setWorking(false);}}
  return <section className="settings-section heyso-cloud-panel" aria-label="LoyoCloud 云空间">
    <div className="integration-heading"><span className="integration-icon"><Cloud size={24}/></span><div><h3>LoyoCloud 云空间</h3><p>{project?.cloud?'在线项目 · '+project.cloud.account:'工作空间中的项目可转存至 LoyoCloud，按 .heyso 文件保存。'}</p></div></div>
    <p role="status">{status?.connected?'已登录 · '+status.user.username:'尚未连接 LoyoCloud'}{working?' · 正在处理…':''}</p>
    {(error||status?.error||project?.cloud?.error)&&<p role="alert" className="settings-error">{error||status?.error||project.cloud.error}</p>}
    <div className="inline" style={{flexWrap:'wrap',gap:8}}>
      {!status?.connected&&<button disabled={busy||working} onClick={()=>login()}>登录 LoyoCloud</button>}
      {project&&!project.cloud&&<button className="primary" disabled={busy||working} onClick={()=>status?.connected?run(()=>convert(project.id)):login(project.id)}>转为在线项目</button>}
      {status?.connected&&<>{!status.primary&&<button disabled={busy||working} onClick={()=>run(async()=>setFiles((await api('/api/cloud/files')).files))}>打开云端项目</button>}<a className="button" href={status.base+'/console#apps'} target="_blank" rel="noreferrer">管理应用与授权 ↗</a>{!status.primary&&<button disabled={busy||working} onClick={()=>run(async()=>{setStatus(await api('/api/cloud/logout',{}));setFiles(null);onStateRef.current({state:await api('/api/state')});})}>退出 HeySO 云登录</button>}</>}
      <button aria-label="刷新云连接" disabled={working} onClick={()=>run(refresh)}><RefreshCw size={14}/></button>
      {project&&<a className="button" href={'/api/projects/'+encodeURIComponent(project.id)+'/export'} download><Download size={14}/>导出 .heyso</a>}
      <label className="button"><Upload size={14}/>导入 .heyso<input type="file" accept=".heyso,application/json" hidden disabled={busy||working} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;run(async()=>{if(f.size>10*1024*1024)throw Error('项目文件不能超过 10 MB');const content=JSON.parse(await f.text());const state=await api('/api/state');onStateRef.current(await api('/api/projects/import',{content,revision:state.revision}));setToast('已导入工作空间');});}}/></label>
    </div>
    {project?.cloud&&<><p>项目操作成功后自动保存到云空间；云端版本冲突时请刷新后重试。</p><label className="field"><span>HeySO 远程 MCP 地址</span><input readOnly value={(status?.base||project.cloud.base)+'/mcp/heyso'}/></label><p>AI 工具通过 OAuth 单独授权，可读取项目、回报进展和提交成果。人工验收仍在 HeySO 中完成。</p></>}
    {files&&<div className="member-list"><h4>云空间中的 HeySO 项目</h4>{files.length?files.map(f=><button key={f.id} disabled={working||busy} onClick={()=>run(async()=>{onStateRef.current(await api('/api/cloud/open',{fileId:f.id}));setFiles(null);setToast('已打开在线项目');})}>{f.name}.heyso</button>):<p>云空间中还没有 HeySO 项目。</p>}</div>}
  </section>;
}
