import {ReplicaForm,ReplicaInput,ReplicaButton} from './ReplicaControls.jsx';
import {AntAlert,AntCard} from './AntStructures.jsx';
import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import logo from './assets/heyso-icon.svg';
import './entry.css';
import SetupWizard from './SetupWizard.jsx';

const Hosting=createContext({hosted:false});
export const useHosting=()=>useContext(Hosting);
async function api(path,body){
  const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-HeySO-Client':'local-ui'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'暂时无法连接，请重试');return data;
}
export default function AccessGate({children}){
  const [session,setSession]=useState(null),[mode,setMode]=useState('loyocloud'),[password,setPassword]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[bootstrap,setBootstrap]=useState(null),[waiting,setWaiting]=useState(false);
  const popup=useRef(null),flow=useRef(null),timer=useRef(null),autoLogin=useRef(false);
  function returnLocation(){const url=new URL(location.href);for(const key of ['heysoCallback','code','state'])url.searchParams.delete(key);return url.pathname+url.search+url.hash;}
  async function redirectLogin(){
    setBusy(true);setError('');
    try{const next=await api('/api/auth/cloud/connect',{});sessionStorage.setItem('heyso-login-return',JSON.stringify({state:next.state,path:returnLocation(),createdAt:Date.now()}));location.assign(next.url);}catch(e){setBusy(false);setError(e.message);}
  }
  function requestConnectionChange(proceed){
    const event=new CustomEvent('heyso-before-connection-change',{cancelable:true,detail:{proceed}});
    if(window.dispatchEvent(event))return proceed();
  }
  async function check(){
    try{
      const response=await fetch('/api/session');
      if(response.status===404||response.headers.get('content-type')?.includes('text/html')){setSession({hosted:false,authenticated:true});return;}
      const data=await response.json();if(!response.ok)throw Error(data.error||'服务暂时不可用');
      let verifyCloud=false;try{verifyCloud=data.redirectLogin&&data.cloudAvailable&&!autoLogin.current&&new URL(document.referrer).origin===new URL(data.loyoBase).origin;}catch{}
      setSession(verifyCloud?{...data,authenticated:false}:data);setMode(data.provider==='loyocloud'||(!data.workspaceAvailable&&data.cloudAvailable)?'loyocloud':'workspace');setError(data.workspaceError||'');
    }catch(e){setError(e.message);}
  }
  async function configure(){return requestConnectionChange(async()=>{
    try{setBootstrap(await api('/api/setup'));}catch(e){setError(e.message);}
  });}
  async function logout(){return requestConnectionChange(async()=>{
    try{const response=await fetch('/api/session',{method:'DELETE'});if(!response.ok)throw Error('退出失败，请重试');await check();}catch(e){setError(e.message);}
  });}
  useEffect(()=>{
    const callback=new URLSearchParams(location.search);
    if(callback.get('heysoCallback')==='1'){
      autoLogin.current=true;
      const state=callback.get('state'),code=callback.get('code');history.replaceState(history.state,'',returnLocation());
      (async()=>{setBusy(true);try{const saved=JSON.parse(sessionStorage.getItem('heyso-login-return')||'null');if(!saved||saved.state!==state||Date.now()-saved.createdAt>300000)throw Error('登录确认已失效，请重新登录');await api('/api/auth/cloud/exchange',{state,code});sessionStorage.removeItem('heyso-login-return');if(saved.path?.startsWith('/')&&!saved.path.startsWith('//'))history.replaceState(history.state,'',saved.path);await check();}catch(e){await check();setError(e.message);}finally{setBusy(false);}})();
    }else check();const expired=()=>{setSession(current=>({...current,authenticated:false}));check();};
    window.addEventListener('heyso-session-expired',expired);
    return()=>window.removeEventListener('heyso-session-expired',expired);
  },[]);
  useEffect(()=>{
    async function receive(event){
      const current=flow.current;
      if(!current||event.source!==popup.current||event.origin!==current.base||event.data?.type!=='loyocloud_connected'||event.data.state!==current.state)return;
      flow.current=null;clearInterval(timer.current);setBusy(true);setWaiting(false);setError('');
      try{await api('/api/auth/cloud/exchange',{code:event.data.code,state:event.data.state});await check();}
      catch(e){setError(e.message);}finally{setBusy(false);popup.current?.close();}
    }
    window.addEventListener('message',receive);
    return()=>{window.removeEventListener('message',receive);clearInterval(timer.current);flow.current=null;popup.current?.close();};
  },[]);
  useEffect(()=>{
    if(!session||session.authenticated||!session.cloudAvailable||!session.redirectLogin||autoLogin.current||new URLSearchParams(location.search).has('heysoCallback'))return;
    let fromCloud=false;try{fromCloud=new URL(document.referrer).origin===new URL(session.loyoBase).origin;}catch{}
    if(fromCloud){autoLogin.current=true;redirectLogin();}
  },[session]);
  async function loginCloud(){
    if(session?.redirectLogin)return redirectLogin();
    popup.current?.close();clearInterval(timer.current);
    popup.current=window.open('about:blank','heyso-account-login','width=640,height=760');
    if(!popup.current){setError('请允许登录弹窗，然后重试');return;}
    setBusy(true);setError('');
    try{
      const next=await api('/api/auth/cloud/connect',{});flow.current=next;popup.current.location.href=next.url;setWaiting(true);
      timer.current=setInterval(()=>{if(popup.current?.closed){clearInterval(timer.current);if(flow.current){flow.current=null;setWaiting(false);setError('登录窗口已关闭，可重新登录');}}},500);
    }catch(e){popup.current?.close();setError(e.message);}finally{setBusy(false);}
  }
  async function switchMode(next){
    setError('');setPassword('');setBusy(true);
    try{await api('/api/auth/mode',{mode:next});setMode(next);}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function loginWorkspace(event){
    event.preventDefault();setBusy(true);setError('');
    try{await api('/api/auth/mode',{mode:'workspace'});await api('/api/session',{password});setPassword('');await check();}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  if(bootstrap)return <SetupWizard bootstrap={bootstrap} onComplete={async()=>{setBootstrap(null);await check();}} onCancel={()=>setBootstrap(null)}/>;
  if(session?.authenticated)return <Hosting.Provider value={{...session,logout,configure}}>{children}</Hosting.Provider>;
  const cloud=session?.cloudAvailable,workspace=session?.workspaceAvailable;
  return <main className="access-page"><AntCard className="access-card">
    <div className="access-brand"><img src={logo} alt=""/><span>HeySO <small>合序</small></span></div>
    <h1>打开你的工作空间</h1><p>让人与 AI 围绕共同成果协作。</p>
    {!session?<p role="status">正在连接工作空间…</p>:<>
      {cloud&&workspace&&<div className="entry-modes" role="group" aria-label="进入方式">
        <ReplicaButton type="button" aria-pressed={mode==='loyocloud'} onClick={()=>switchMode('loyocloud')} disabled={busy||waiting}>LoyoCloud 账号</ReplicaButton>
        <ReplicaButton type="button" aria-pressed={mode==='workspace'} onClick={()=>switchMode('workspace')} disabled={busy||waiting}>独立工作空间</ReplicaButton>
      </div>}
      {cloud&&mode==='loyocloud'?<div className="entry-panel">
        <p>使用你的 LoyoCloud 账号，访问个人云空间中的项目。</p>
        <ReplicaButton className="primary" onClick={loginCloud} disabled={busy}>{busy?'正在验证…':waiting?'重新打开登录窗口':'使用 LoyoCloud 登录'}</ReplicaButton>
        {waiting&&<p role="status">请在登录窗口中完成账号验证和授权。</p>}
      </div>:workspace?<ReplicaForm onSubmit={loginWorkspace}>
        <p>输入工作空间访问密码，进入此部署的项目。</p>
        <label htmlFor="workspace-password">工作空间访问密码</label>
        <ReplicaInput id="workspace-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="输入管理员提供的访问密码"/>
        <ReplicaButton className="primary" type="submit" disabled={busy}>{busy?'正在打开…':'进入独立工作空间'}</ReplicaButton>
      </ReplicaForm>:<p role="status">工作空间尚未准备完成，请联系管理员。</p>}
      <ReplicaButton className="text-btn entry-admin" onClick={configure} disabled={busy||waiting}>管理员配置</ReplicaButton>
    </>}
    {error&&<AntAlert className="access-error" role="alert">{error}</AntAlert>}
    {!session&&<ReplicaButton onClick={check}>重新连接</ReplicaButton>}
  </AntCard></main>;
}
