// Install alongside the existing popup /connect/heyso flow. The issued code uses
// the existing editor/exchange endpoint and remains bound to PKCE and origin.
export function installHeysoRedirectLogin(app,{db,login,csrf,origins,putSecret,allowsEditorOrigin}){
  const html=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=input=>{
    const {origin,state,code_challenge}=input;
    if(!allowsEditorOrigin(origins,'heyso',origin)||!/^[A-Za-z0-9_-]{20,128}$/.test(String(state))||!/^[A-Za-z0-9_-]{43}$/.test(String(code_challenge)))throw Object.assign(Error('连接来源或 PKCE 参数无效'),{status:400});
    // A fixed destination prevents open redirects and credential exfiltration.
    return {origin,state,code_challenge};
  };
  const finish=async(req,res,input)=>{
    const code=await putSecret(db,'editor_code',req.user.id,{origin:input.origin,app:'heyso',challenge:input.code_challenge,sessionDays:30},60000);
    const callback=new URL('/',input.origin);callback.search=new URLSearchParams({heysoCallback:'1',code,state:input.state}).toString();
    res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');res.redirect(303,callback.href);
  };
  app.get('/api/v1/heyso/login-capabilities',(_req,res)=>res.set('Cache-Control','no-store').json({redirectLogin:true}));
  app.get('/connect/heyso/redirect',login,async(req,res)=>{
    const input=valid(req.query);
    const trusted=(await db.query("SELECT 1 FROM secrets WHERE user_id=$1 AND kind='editor' AND data->>'app'='heyso' AND data->>'origin'=$2 AND expires_at>now() LIMIT 1",[req.user.id,input.origin])).rows.length>0;
    if(trusted)return finish(req,res,input);
    res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');
    const fields={...input,csrf:req.session.data.csrf};
    res.type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接 HeySO · LoyoCloud</title><link rel="stylesheet" href="/app.css"><main><section class="auth"><h1>连接 HeySO</h1><p>将当前账号连接到：</p><pre>${html(input.origin)}</pre><p>此应用将能够读取和修改你云空间中的 HeySO 项目。请确认这是你信任的部署。</p><form method="post" action="/connect/heyso/redirect">${Object.entries(fields).map(([name,value])=>`<input type="hidden" name="${name}" value="${html(value)}">`).join('')}<button>授权并进入 HeySO</button></form></section></main></html>`);
  });
  app.post('/connect/heyso/redirect',login,csrf,async(req,res)=>finish(req,res,valid(req.body)));
}
