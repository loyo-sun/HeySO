import test from 'node:test';
import assert from 'node:assert/strict';
import {installHeysoRedirectLogin} from '../deploy/unified-login/overlay/src/heyso-login.mjs';
function service(trusted=false){
 const routes=new Map(),issued=[];
 const login=()=>{},csrf=()=>{};
 installHeysoRedirectLogin({get:(path,...handlers)=>routes.set('GET '+path,handlers),post:(path,...handlers)=>routes.set('POST '+path,handlers)},{
  login,csrf,origins:new Set(),db:{query:async()=>({rows:trusted?[{}]:[]})},
  allowsEditorOrigin:(_origins,app,origin)=>app==='heyso'&&origin==='https://heyso.example',
  putSecret:async(...args)=>{issued.push(args);return 'one-time-code';},
 });
 const input={origin:'https://heyso.example',state:'state-value-at-least-20-characters',code_challenge:'a'.repeat(43)};
 const req={query:input,body:input,user:{id:'current-cloud-account'},session:{data:{csrf:'csrf-test'}}};
 const res={headers:{},set(k,v){this.headers[k]=v;return this;},type(){return this;},send(v){this.html=v;return this;},redirect(status,url){this.status=status;this.url=url;},json(value){this.body=value;}};
 return {routes,issued,req,res,login,csrf};
}
test('authorized cloud account enters its trusted HeySO source with a one-time PKCE code',async()=>{
 const {routes,issued,req,res}=service(true);const handlers=routes.get('GET /connect/heyso/redirect');await handlers.at(-1)(req,res);
 assert.equal(res.status,303);const callback=new URL(res.url);assert.equal(callback.origin,req.query.origin);assert.equal(callback.pathname,'/');assert.equal(callback.searchParams.get('code'),'one-time-code');assert.equal(callback.searchParams.get('state'),req.query.state);
 assert.equal(issued[0][2],'current-cloud-account');assert.equal(issued[0][3].challenge,req.query.code_challenge);assert.equal(issued[0][3].app,'heyso');assert.equal(issued[0][4],60000);assert.equal(res.headers['Referrer-Policy'],'no-referrer');
});
test('new deployment requires explicit consent protected by cloud login and CSRF',async()=>{
 const {routes,issued,req,res,login,csrf}=service(false);assert.equal(routes.get('GET /connect/heyso/redirect')[0],login);assert.equal(routes.get('POST /connect/heyso/redirect')[1],csrf);
 await routes.get('GET /connect/heyso/redirect').at(-1)(req,res);assert.equal(issued.length,0);assert.match(res.html,/授权并进入 HeySO/);assert.match(res.html,/csrf-test/);
 await routes.get('POST /connect/heyso/redirect').at(-1)(req,res);assert.equal(issued.length,1);assert.equal(res.status,303);
});
test('foreign origins and invalid state are rejected before issuing login codes',async()=>{
 const {routes,issued,req,res}=service(true);req.query={...req.query,origin:'https://attacker.example'};await assert.rejects(routes.get('GET /connect/heyso/redirect').at(-1)(req,res));assert.equal(issued.length,0);
 req.body={...req.body,state:'short'};await assert.rejects(routes.get('POST /connect/heyso/redirect').at(-1)(req,res));assert.equal(issued.length,0);
});
