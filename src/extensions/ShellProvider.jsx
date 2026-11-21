import React,{createContext,useContext} from 'react';
import {createShellExtensions,resolveSlot,ordered} from './contract.mjs';
const Configuration=createContext(createShellExtensions());
const Runtime=createContext(null);
export function ShellProvider({extensions,children}) {return <Configuration.Provider value={extensions}>{children}</Configuration.Provider>;}
export const ShellRuntimeProvider=Runtime.Provider;
export const useShellConfiguration=()=>useContext(Configuration);
export function useShellContext(){const value=useContext(Runtime);if(!value)throw Error('Shell context is only available inside the running application');return value;}
export function ExtensionContent({entry,context}){if(entry.component){const Component=entry.component;return <Component {...context}/>;}return entry.render?entry.render(context):entry.node;}
export function ExtensionSlot({id,context,children}) {
  const configuration=useShellConfiguration(),inherited=useContext(Runtime),ctx=context||inherited;
  const value=resolveSlot(configuration,id,ctx);
  if(value.hidden)return null;
  return <>{value.replace?<ExtensionContent entry={value.replace} context={ctx}/>:children}{value.append.map(e=><ExtensionContent key={e.id} entry={e} context={ctx}/>)}</>;
}
export function ShellMenu({items,label='宿主主导航'}) {
  const context=useShellContext();const ids=new Set();
  for(const item of items){if(ids.has(item.id))throw Error('Duplicate menu id: '+item.id);ids.add(item.id);}
  const visible=ordered(items).filter(i=>!i.when||i.when(context));
  return visible.length?<nav aria-label={label} className="heyso-shell-menu">{visible.map(item=><button type="button" key={item.id} aria-current={item.active?.(context)?'page':undefined} disabled={item.disabled?.(context)} onClick={()=>item.onSelect(context)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...event.currentTarget.parentElement.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(event.currentTarget),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}}}>{item.icon}{item.label}</button>)}</nav>:null;
}
