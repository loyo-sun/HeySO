import React from 'react';
import {createShellExtensions,ShellMenu,type ShellContext,type SettingsContext} from '../src/extensions/index.jsx';
const config=createShellExtensions({contractVersion:'1.0.0',slots:[{id:'nav',slot:'header.navigation',render:ctx=><ShellMenu items={[{id:'x',label:ctx.project?.name,onSelect:c=>c.navigate({view:'list'})}]}/>}],settingsPages:[{id:'custom',label:'Custom',render:(ctx:SettingsContext)=><button onClick={()=>ctx.setDirty(true)}>{ctx.projectId}</button>}]});
// @ts-expect-error incompatible major version must fail
createShellExtensions({contractVersion:'2.0.0'});
// @ts-expect-error unknown slot must fail
createShellExtensions({slots:[{id:'x',slot:'headerActions',node:'x'}]});
// @ts-expect-error brand requires explicit replace or hide
createShellExtensions({slots:[{id:'x',slot:'header.brand',node:'x'}]});
function check(ctx:ShellContext){
 // @ts-expect-error server secrets are not part of context
 return ctx.token;
}
void config;void check;
