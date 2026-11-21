import React,{useRef,useState} from 'react';
import {ConfigProvider} from 'antd';
import {StyleProvider} from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';
import {useShellConfiguration} from './extensions/ShellProvider.jsx';
import {OverlayContext} from './extensions/OverlayContext.jsx';
import './app.css';
import './entry.css';
import './work-item-snapshot.css';
export default function ReplicaTheme({children}) {
  const {theme}=useShellConfiguration(),root=useRef(null);
  const [overlay,setOverlay]=useState(null);
  const container=()=>overlay||root.current||document.body;
  const variables={'--heyso-accent':theme.accent||'#f5642e','--heyso-background':theme.background||'#f7f8fa','--heyso-text':theme.text||'#252525','--heyso-border':theme.border||'#e9e9eb','--heyso-muted':theme.muted||'#85858a'};
  return <div className="heyso-root" data-heyso-contract="1.0.0" ref={root} style={variables}><OverlayContext.Provider value={container}><StyleProvider layer><ConfigProvider locale={zhCN} getPopupContainer={container} getTargetContainer={()=>root.current||document.body} button={{autoInsertSpace:false}} wave={{disabled:true}} theme={{inherit:false,token:{colorPrimary:theme.accent||'#f5642e',colorInfo:theme.accent||'#f5642e',colorSuccess:'#4c8e71',colorWarning:'#b18a3e',colorError:'#d16a50',fontFamily:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',fontSize:13,fontSizeSM:12}}}>{overlay&&children}<div className="heyso-overlay-root" ref={setOverlay} data-heyso-component="OverlayRoot"/></ConfigProvider></StyleProvider></OverlayContext.Provider></div>;
}
