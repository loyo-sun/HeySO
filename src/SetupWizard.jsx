import {ReplicaForm,ReplicaInput,ReplicaButton} from './ReplicaControls.jsx';
import {AntAlert,AntDisclosure,AntCard} from './AntStructures.jsx';
import {Steps} from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { Cloud, Database, ShieldCheck, CheckCircle2, ArrowLeft } from 'lucide-react';
import logo from './assets/heyso-icon.svg';


const providers = [
  { id: 'loyocloud', name: 'LoyoCloud', icon: Cloud, description: '登录云账号，项目保存在你的云空间。' },
  { id: 'upstash', name: 'Upstash', icon: Database, description: '连接自己的 Redis 数据库，保存私人工作空间。' },
  { id: 'cloudflare', name: 'Cloudflare', icon: ShieldCheck, description: '使用 Cloudflare 存储，可独立于页面部署。' },
];
const platformNames = { netlify: 'Netlify', vercel: 'Vercel', cloudflare: 'Cloudflare' };
async function api(path, body) {
  const response = await fetch('/api/setup' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw Error(data.error || '配置失败，请稍后重试'); return data;
}
export default function SetupWizard({ bootstrap, onComplete, onCancel }) {
  const [step, setStep] = useState(bootstrap.unlocked ? 1 : 0), [setupKey, setSetupKey] = useState('');
  const [provider, setProvider] = useState(bootstrap.nativeCloudflare ? 'cloudflare' : 'loyocloud');
  const [url, setUrl] = useState(''), [token, setToken] = useState(''), [key, setKey] = useState(bootstrap.redisKey || 'heyso:workspace:v1');
  const [native, setNative] = useState(bootstrap.nativeCloudflare), [useEnvironment, setUseEnvironment] = useState(false);
  const [base, setBase] = useState(bootstrap.loyoBase || 'https://cloud.loyo.work'), [account, setAccount] = useState(null);
  const [tested, setTested] = useState(null), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [waiting, setWaiting] = useState(false);
  const flow = useRef(null), popup = useRef(null);
  const selected = () => ({ provider, url, token, key, native, useEnvironment });
  useEffect(() => { setTested(null); setError(''); }, [provider, url, token, key, native, useEnvironment]);
  useEffect(() => {
    const receive = async event => {
      const current = flow.current;
      if (!current || event.source !== popup.current || event.origin !== current.base || event.data?.type !== 'loyocloud_connected' || event.data.state !== current.state) return;
      flow.current = null; setBusy(true); setError('');
      try { const data = await api('/cloud/exchange', { state: event.data.state, code: event.data.code }); setAccount(data.user); setTested(null); }
      catch (e) { setError(e.message); }
      finally { setBusy(false); setWaiting(false); popup.current?.close(); }
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); flow.current = null; popup.current?.close(); };
  }, []);
  async function run(fn) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function connect() {
    popup.current?.close(); popup.current = window.open('about:blank', 'heyso-setup-login', 'width=640,height=760');
    if (!popup.current) { setError('请允许登录弹窗后重试'); return; }
    await run(async () => { try { const next = await api('/cloud/connect', { base }); flow.current = next; popup.current.location.href = next.url; setWaiting(true); } catch (e) { popup.current?.close(); throw e; } });
  }
  const active = providers.find(p => p.id === provider);
  return <main className="access-page"><AntCard className="setup-card">
    <div className="setup-heading"><div className="access-brand"><img src={logo} alt=""/><span>HeySO <small>合序</small></span></div><span className="setup-platform">页面托管于 {platformNames[bootstrap.platform] || '云端'}</span></div>
    <h1>配置你的云端工作空间</h1>
    <p className="setup-intro">选择数据保存的位置。页面部署和云端存储可以分别选择。</p>
    <Steps className="setup-steps heyso-setup-steps" current={step} responsive={false} items={['验证身份','连接云端存储','完成设置'].map((title,i)=>({title,icon:step>i?<CheckCircle2 size={15}/>:i+1,className:step===i?'active':step>i?'complete':''}))}/>
    {step === 0 && <ReplicaForm onSubmit={e => { e.preventDefault(); run(async () => { await api('/unlock', { setupKey }); setSetupKey(''); setStep(1); }); }}>
      {bootstrap.ownerConfigured ? <><h2>确认这是你的部署</h2><p>输入部署时设置的初始化密钥，开始配置。只有部署者可以建立新的连接。</p><label htmlFor="setup-key">初始化密钥</label><ReplicaInput id="setup-key" type="password" autoComplete="off" required value={setupKey} onChange={e => setSetupKey(e.target.value)} placeholder="HEYSO_SETUP_KEY"/><ReplicaButton className="primary" disabled={busy}>{busy ? '正在验证…' : '验证并继续'}</ReplicaButton></> : <div className="setup-note"><h2>先设置初始化密钥</h2><p>在 {platformNames[bootstrap.platform] || '部署平台'} 的环境变量或 Secrets 中添加 <code>HEYSO_SETUP_KEY</code>，填写自己生成的至少 32 位随机密钥，然后重新部署并刷新此页面。</p><ReplicaButton type="button" onClick={() => window.location.reload()}>已设置，重新检查</ReplicaButton></div>}
    </ReplicaForm>}
    {step === 1 && <>
      <div className="setup-providers">{providers.map(({ id, name, icon: Icon, description }) => <ReplicaButton key={id} type="button" className={provider === id ? 'selected' : ''} aria-pressed={provider === id} onClick={() => { setProvider(id); setUrl(''); setToken(''); setUseEnvironment(false); }} disabled={busy}><Icon size={22}/><strong>{name}</strong><span>{description}</span></ReplicaButton>)}</div>
      <div className="setup-provider-form">
        {provider === 'loyocloud' ? <><h2>连接 LoyoCloud 云账号</h2><p>直接读取和保存云空间中的项目，无需额外的 Redis 或 Cloudflare 数据库。</p><label htmlFor="cloud-base">LoyoCloud 地址</label><ReplicaInput id="cloud-base" type="url" value={base} onChange={e => { setBase(e.target.value); setAccount(null); setTested(null); }} disabled={busy}/><div className="setup-connect-row"><ReplicaButton type="button" onClick={connect} disabled={busy}>{account ? '切换登录账号' : waiting ? '重新打开登录窗口' : '登录并授权 LoyoCloud'}</ReplicaButton>{account && <span className="setup-success"><CheckCircle2 size={15}/>已登录 {account.username}</span>}{waiting && <span>请在弹窗中完成授权</span>}</div></> : <>
          <h2>{provider === 'upstash' ? '连接 Upstash Redis' : '连接 Cloudflare 存储'}</h2>
          {provider === 'cloudflare' && bootstrap.nativeCloudflare && <label className="setup-checkbox"><ReplicaInput type="checkbox" checked={native} onChange={e => setNative(e.target.checked)} disabled={busy}/>使用当前 Cloudflare 实例自带的存储</label>}
          {!(provider === 'cloudflare' && native) && <>
            <p>{provider === 'upstash' ? '填写数据库的 REST 地址和读写密钥。已有项目会继续保留。' : '页面托管在其他平台时，连接独立部署的 Cloudflare 存储服务。填写该服务的网址和存储连接密钥。'}</p>
            {(provider === 'upstash' ? bootstrap.hasEnvironmentRedis : bootstrap.hasEnvironmentCloudflare) && <label className="setup-checkbox"><ReplicaInput type="checkbox" checked={useEnvironment} onChange={e => setUseEnvironment(e.target.checked)} disabled={busy}/>使用部署环境中已有的连接设置</label>}
            {!useEnvironment && <><label htmlFor="storage-url">{provider === 'upstash' ? 'Redis REST 地址' : 'Cloudflare 存储服务地址'}</label><ReplicaInput id="storage-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder={provider === 'upstash' ? 'https://你的数据库.upstash.io' : 'https://你的存储服务.workers.dev'} disabled={busy}/><label htmlFor="storage-token">{provider === 'upstash' ? 'REST 读写密钥' : '存储连接密钥'}</label><ReplicaInput id="storage-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} disabled={busy}/></>}
          </>}
          {provider === 'cloudflare' && native && <p>项目直接保存到本实例的 Durable Objects 存储，重新部署后仍保留。不需要另建数据库。</p>}
          {provider === 'upstash' && <AntDisclosure><summary>高级设置：存储标识</summary><label htmlFor="storage-key">同一数据库中的工作空间标识</label><ReplicaInput id="storage-key" value={key} onChange={e => setKey(e.target.value)} disabled={busy}/><p>连接已有工作空间时，请保持原标识不变。</p></AntDisclosure>}
        </>}
      </div>
      {tested && <div className="setup-success setup-note" role="status"><CheckCircle2 size={18}/><span>连接检查通过 · {tested.projects} 个已有项目。完成设置不会覆盖这些数据。</span></div>}
      <div className="setup-actions"><ReplicaButton type="button" disabled={busy || (provider === 'loyocloud' && !account)} onClick={() => run(async () => setTested(await api('/test', selected())))}>{busy ? '正在检查…' : tested ? '重新检查连接' : '检查连接'}</ReplicaButton><ReplicaButton className="primary" type="button" disabled={busy || !tested} onClick={() => setStep(2)}>继续</ReplicaButton></div>
    </>}
    {step === 2 && <ReplicaForm onSubmit={e => { e.preventDefault(); if (password !== confirm) { setError('两次输入的访问密码不一致'); return; } run(async () => { await api('/complete', { ...selected(), password }); setPassword(''); setConfirm(''); await onComplete(); }); }}>
      <div className="setup-summary"><CheckCircle2 size={22}/><div><strong>{active.name} 已连接</strong><p>页面：{platformNames[bootstrap.platform]} · 云端数据：{active.name}{account && provider === 'loyocloud' ? ' · ' + account.username : ''}</p></div></div>
      <h2>设置工作空间访问密码</h2><p>访问密码至少 16 位，用于保护本浏览器记住的云端连接。</p><label htmlFor="setup-password">访问密码</label><ReplicaInput id="setup-password" type="password" autoComplete="new-password" minLength={16} required value={password} onChange={e => setPassword(e.target.value)}/><label htmlFor="setup-confirm">再次输入访问密码</label><ReplicaInput id="setup-confirm" type="password" autoComplete="new-password" minLength={16} required value={confirm} onChange={e => setConfirm(e.target.value)}/><div className="setup-actions"><ReplicaButton type="button" onClick={() => setStep(1)} disabled={busy}><ArrowLeft size={14}/>返回</ReplicaButton><ReplicaButton className="primary" disabled={busy}>{busy ? '正在完成…' : '完成配置，进入工作空间'}</ReplicaButton></div>
    </ReplicaForm>}
    {error && <AntAlert className="access-error" role="alert">{error}</AntAlert>}
    <div className="setup-footer"><small>连接设置加密保存在本浏览器；项目保存在所选云端。换设备可重新连接。</small>{onCancel && <ReplicaButton className="text-btn" onClick={onCancel} disabled={busy}>返回工作空间</ReplicaButton>}</div>
  </AntCard></main>;
}
