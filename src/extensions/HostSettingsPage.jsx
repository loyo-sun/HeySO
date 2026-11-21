import React,{useEffect} from 'react';
import {ExtensionContent} from './ShellProvider.jsx';
export default function HostSettingsPage({entry,context,setDirty}){
  useEffect(()=>()=>setDirty(false),[setDirty]);
  return <section className="settings-content" data-heyso-component="HostSettingsPage" aria-label={entry.label}><h1>{entry.label}</h1><ExtensionContent entry={entry} context={{...context,setDirty}}/></section>;
}
