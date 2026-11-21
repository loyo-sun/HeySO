import React,{useState} from 'react';
import demoLogo from './logo.svg';
import {Modal,Select} from 'antd';
import {FolderKanban,Settings,HelpCircle,User,Info} from 'lucide-react';
import {createShellExtensions,ShellMenu,useOverlayContainer} from '../../src/extensions/index.jsx';
function Notes({setDirty,capabilities,requestHostNavigation,navigate}) {
  const [note,setNote]=useState('');
  return <div className="demo-notes"><p>虚构宿主设置页。此草稿仅用于演示未保存保护，不写入项目或服务端。</p><label>演示备注<input aria-label="演示备注" value={note} readOnly={capabilities.readOnly} onChange={e=>{setNote(e.target.value);setDirty(!!e.target.value);}}/></label><button type="button" disabled={capabilities.readOnly} onClick={()=>{setNote('');setDirty(false);}}>清除演示草稿</button><button type="button" onClick={()=>requestHostNavigation(()=>navigate({page:'dashboard'}))}>返回演示协作台</button></div>;
}
function Account() {
  const container=useOverlayContainer(),[open,setOpen]=useState(false);
  return <><button type="button" aria-label="演示账号" onClick={()=>setOpen(true)}><User size={17}/></button><Modal title="虚构账号面板" open={open} onCancel={()=>setOpen(false)} onOk={()=>setOpen(false)} getContainer={container}><p>演示访客 · 不含真实账号、组织或令牌。</p><Select className="demo-preference" showSearch={false} style={{width:180}} aria-label="演示偏好" defaultValue="light" options={[{value:'light',label:'明亮'},{value:'system',label:'跟随系统'}]}/></Modal></>;
}
export const createDemoExtensions=({readOnly=false,hideMcpSettings=false}={})=>createShellExtensions({
  readOnly,
  contractVersion:'1.0.0',theme:{accent:'#287b67'},
  slots:[
    {id:'demo-brand',slot:'header.brand',mode:'replace',render:ctx=><button type="button" className="demo-brand" aria-label="示例工作台首页" onClick={()=>ctx.navigate({page:'projects',view:'roadmap'})}><img src={demoLogo} alt=""/><span>示例工作台</span></button>},
    {id:'demo-menu',slot:'header.navigation',render:()=> <ShellMenu items={[
      {id:'workspace',label:'项目空间',order:20,active:ctx=>ctx.route.page==='projects',onSelect:ctx=>ctx.navigate({page:'projects',view:'roadmap'})},
      {id:'desk',label:'协作台',order:10,active:ctx=>ctx.route.page==='dashboard',onSelect:ctx=>ctx.navigate({page:'dashboard'})},
    ]}/>},
    {id:'demo-project',slot:'header.project-entry',mode:'replace',when:ctx=>!!ctx.project,render:ctx=><button type="button" aria-label="进入研发" title="进入研发" onClick={()=>ctx.navigate({page:'projects',view:'list'})}><FolderKanban size={17}/><span className="demo-project-label">进入研发</span></button>},
    {id:'demo-tools',slot:'project.selector-actions',render:ctx=><button type="button" aria-label="项目工具" title="项目工具" onClick={()=>ctx.navigate({settingsSection:'demo-notes'})}><Settings size={16}/></button>},
    {id:'demo-project-info',slot:'project.title-actions',render:ctx=><button type="button" aria-label="项目说明" onClick={ctx.openHelp}><Info size={16}/></button>},
    {id:'demo-account',slot:'header.right',mode:'replace',component:Account},
    {id:'demo-help',slot:'header.right',order:10,render:ctx=><button type="button" aria-label="宿主帮助" onClick={ctx.openHelp}><HelpCircle size={17}/></button>},
  ],
  settingsPages:[
    ...(hideMcpSettings?[{id:'integrations',mode:'hide'}]:[]),
    {id:'demo-notes',label:'演示备注',order:50,component:Notes},
    {id:'about',mode:'replace',label:'宿主说明',render:ctx=><p>这是替换后的公开示例页，当前项目：{ctx.project?.name}。没有接入任何 SaaS 私有能力。</p>},
  ],
});

export const extensions=createDemoExtensions();
