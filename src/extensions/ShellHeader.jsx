import React from 'react';
import {FolderKanban} from 'lucide-react';
import {ExtensionSlot,useShellContext} from './ShellProvider.jsx';
import logo from '../assets/heyso-icon.svg';
export default function ShellHeader({right,projectSelector}) {
  const context=useShellContext();
  return <header className="appbar" data-heyso-component="ShellHeader">
    <div className="heyso-shell-brand" data-heyso-slot="header.brand"><ExtensionSlot id="header.brand"><button type="button" className="app-brand" aria-label="HeySO 项目首页" onClick={()=>context.navigate({page:'projects',view:'roadmap'})}><img className="mark" src={logo} alt=""/></button></ExtensionSlot></div>
    {projectSelector}
    <div data-heyso-slot="header.navigation"><ExtensionSlot id="header.navigation"/></div>
    <div data-heyso-slot="header.project-entry"><ExtensionSlot id="header.project-entry">{context.project&&context.route.page==='dashboard'&&<button type="button" onClick={()=>context.navigate({page:'projects',view:'roadmap'})}><FolderKanban size={16}/>进入项目</button>}</ExtensionSlot></div>
    <div className="appbar-actions" data-heyso-slot="header.right"><ExtensionSlot id="header.right">{right}</ExtensionSlot></div>
  </header>;
}
