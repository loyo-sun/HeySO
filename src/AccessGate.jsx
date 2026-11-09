import {ReplicaForm,ReplicaInput,ReplicaButton} from './ReplicaControls.jsx';
import {AntAlert,AntCard} from './AntStructures.jsx';
import React, { createContext, useContext, useEffect, useState } from 'react';
import logo from './assets/heyso-icon.svg';

import SetupWizard from './SetupWizard.jsx';

const Hosting = createContext({ hosted: false });
export const useHosting = () => useContext(Hosting);

export default function AccessGate({ children }) {
  const [session, setSession] = useState(null), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);
  function requestConnectionChange(proceed) {
    const event=new CustomEvent('heyso-before-connection-change',{cancelable:true,detail:{proceed}});
    if(window.dispatchEvent(event))return proceed();
  }
  async function configure() {return requestConnectionChange(configureNow);}
  async function configureNow() {
    const response = await fetch('/api/setup');
    if (!response.ok) { setError('无法打开云端存储设置，请稍后重试'); return; }
    setBootstrap(await response.json());
  }
  async function check() {
    try {
      const res = await fetch('/api/session');
      // Allows an already-running pre-upgrade local service to keep working.
      if (res.status === 404 || res.headers.get('content-type')?.includes('text/html')) { setSession({ hosted: false, authenticated: true }); return; }
      const data = await res.json();
      if (!res.ok) throw Error(data.error || '服务暂时不可用');
      if (data.setupRequired) { setSession(data); await configure(); return; }
      setSession(data); setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => {
    check();
    const expired = () => { setSession({ hosted: true, authenticated: false }); check(); };
    window.addEventListener('heyso-session-expired', expired);
    return () => window.removeEventListener('heyso-session-expired', expired);
  }, []);
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const result = await res.json();
      if (!res.ok) throw Error(result.error || '登录失败');
      setPassword(''); await check();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function logout() {return requestConnectionChange(logoutNow);}
  async function logoutNow() {
    const res = await fetch('/api/session', { method: 'DELETE' });
    if (res.ok) { setSession({ hosted: true, authenticated: false }); setError(''); }
  }
  if (bootstrap) return <SetupWizard bootstrap={bootstrap} onComplete={async () => { setBootstrap(null); await check(); }} onCancel={session?.authenticated ? () => setBootstrap(null) : null}/>;
  if (session?.authenticated) return <Hosting.Provider value={{ ...session, logout, configure }}>{children}</Hosting.Provider>;
  return <main className="access-page"><AntCard className="access-card">
    <div className="access-brand"><img src={logo} alt=""/><span>HeySO <small>合序</small></span></div>
    <h1>{session ? '打开你的工作空间' : '连接工作空间'}</h1>
    <p>让人与 AI 围绕共同成果协作。</p>
    {session && <ReplicaForm onSubmit={login}>
      <label htmlFor="workspace-password">访问密码</label>
      <ReplicaInput id="workspace-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} autoFocus placeholder="输入部署时设置的密码"/>
      <ReplicaButton className="primary" type="submit" disabled={busy}>{busy ? '正在打开…' : '进入工作空间'}</ReplicaButton>
    </ReplicaForm>}
    {error && <AntAlert className="access-error" role="alert">{error}</AntAlert>}
    {session?.hosted && <ReplicaButton className="text-btn" type="button" onClick={configure}>重新配置云端存储</ReplicaButton>}
    {!session && <ReplicaButton onClick={check}>重新连接</ReplicaButton>}
    <small>alpha_0.1 · 私人工作空间</small>
  </AntCard></main>;
}
