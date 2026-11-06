import {ReplicaModal,ReplicaButton} from './ReplicaControls.jsx';
import React,{createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {resolveWorkspaceLink} from './workspace-link-policy.mjs';

const Context=createContext({resolve:href=>resolveWorkspaceLink(href),follow:()=>{}});
export const useWorkspaceLinks=()=>useContext(Context);
export function WorkspaceLinksProvider({project,items,onOpen,children}){
  const [pending,setPending]=useState(null),cancel=useRef(null),trigger=useRef(null);
  const value=useMemo(()=>{
    const resolve=href=>resolveWorkspaceLink(href,{project,items,baseUrl:window.location.href});
    return {resolve,follow:href=>{const link=resolve(href);if(link.kind==='internal')onOpen(link.item);else if(link.kind==='external'){trigger.current=document.activeElement;setPending(link);}}};
  },[project,items,onOpen]);
  const close=()=>{setPending(null);if(trigger.current?.isConnected)trigger.current.focus();};
  useEffect(()=>{if(!pending)return;cancel.current?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const controls=[...document.querySelectorAll('.external-link-dialog button,.external-link-dialog a')];if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}}};document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);},[pending]);
  return <Context.Provider value={value}>{children}{pending&&createPortal(<div className="replica-dialog-host"><ReplicaModal className="modal external-link-dialog" role="alertdialog" aria-modal="true" aria-labelledby="external-link-title" aria-describedby="external-link-warning"><header><h2 id="external-link-title">即将离开当前项目</h2></header><div className="modal-body"><p id="external-link-warning">请确认链接地址可信。外部页面可能存在风险，请勿在不明页面输入账号、密码或敏感信息。</p><b>{pending.host}</b><p className="external-link-address">{pending.href}</p></div><footer><ReplicaButton ref={cancel} onClick={close}>取消</ReplicaButton><a className="primary button" href={pending.href} target="_blank" rel="noopener noreferrer" onClick={()=>setPending(null)}>继续访问</a></footer></ReplicaModal></div>,document.body)}</Context.Provider>;
}
export function WorkspaceLink({href,children}){
  const api=useWorkspaceLinks(),link=api.resolve(href);
  if(link.kind==='invalid'||link.kind==='missing')return <span className="muted">{link.kind==='missing'?'工作项不存在或无权访问':children||'无效链接'}</span>;
  return <a href={link.href} className={link.kind==='internal'?'work-item-reference':'workspace-external-link'} onClick={e=>{e.preventDefault();e.stopPropagation();api.follow(href);}}>{link.kind==='internal'?<><span className="link-kind" style={{color:link.color}}>{link.type}</span><span className="link-status">{link.status}</span><span className="link-title">{link.title}</span><span className="link-code">{link.code}</span></>:children||link.href}</a>;
}
