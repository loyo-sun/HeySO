import React, { createContext, useContext, useEffect, useState } from 'react';
import logo from './assets/heyso-icon.svg';
import './access.css';

const Hosting = createContext({ hosted: false });
export const useHosting = () => useContext(Hosting);

export default function AccessGate({ children }) {
  const [session, setSession] = useState(null), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function check() {
    try {
      const res = await fetch('/api/session');
      // Allows an already-running pre-upgrade local service to keep working.
      if (res.status === 404 || res.headers.get('content-type')?.includes('text/html')) { setSession({ hosted: false, authenticated: true }); return; }
      const data = await res.json();
      if (!res.ok) throw Error(data.error || '服务暂时不可用');
      setSession(data); setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => {
    check();
    const expired = () => { setSession({ hosted: true, authenticated: false }); setError('会话已过期，请重新登录'); };
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
  async function logout() {
    const res = await fetch('/api/session', { method: 'DELETE' });
    if (res.ok) { setSession({ hosted: true, authenticated: false }); setError(''); }
  }
  if (session?.authenticated) return <Hosting.Provider value={{ ...session, logout }}>{children}</Hosting.Provider>;
  return <main className="access-page"><section className="access-card">
    <div className="access-brand"><img src={logo} alt=""/><span>HeySO <small>合序</small></span></div>
    <h1>{session ? '打开你的工作空间' : '连接工作空间'}</h1>
    <p>让人与 AI 围绕共同成果协作。</p>
    {session && <form onSubmit={login}>
      <label htmlFor="workspace-password">访问密码</label>
      <input id="workspace-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} autoFocus placeholder="输入部署时设置的密码"/>
      <button className="primary" type="submit" disabled={busy}>{busy ? '正在打开…' : '进入工作空间'}</button>
    </form>}
    {error && <p className="access-error" role="alert">{error}</p>}
    {!session && <button onClick={check}>重新连接</button>}
    <small>alpha_0.1 · 私人工作空间</small>
  </section></main>;
}
