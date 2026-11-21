import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../HeySOApp.jsx';
import ReplicaTheme from '../ReplicaTheme.jsx';
import AccessGate from '../AccessGate.jsx';
import {createShellExtensions} from './contract.mjs';
import {ShellProvider} from './ShellProvider.jsx';
export {contractVersion,slotDefinitions,createShellExtensions} from './contract.mjs';
export {ShellProvider,ExtensionSlot,ShellMenu,useShellContext} from './ShellProvider.jsx';
export {useOverlayContainer} from './OverlayContext.jsx';
export function HeySOApplication({extensions}) {
  const registry=React.useRef(null);
  if(!registry.current)registry.current=createShellExtensions(extensions);
  return <ShellProvider extensions={registry.current}><ReplicaTheme><AccessGate><App/></AccessGate></ReplicaTheme></ShellProvider>;
}
export function mountHeySO(container,options={}) {
  if(!container)throw Error('A mount element is required');
  if(container.__heysoRoot)throw Error('HeySO already mounted; unmount before registering another host');
  const extensions=createShellExtensions(options.extensions||{}),root=createRoot(container);
  container.__heysoRoot=root;root.render(<HeySOApplication extensions={extensions}/>);
  return {unmount(){root.unmount();delete container.__heysoRoot;}};
}
