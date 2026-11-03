const statuses = ['new','considering','planned','building','ready','shipped','declined'];
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
async function body(req) {
 if(!req.headers.get('content-type')?.includes('application/json')) fail('JSON required',415);
 const reader=req.body?.getReader(); if(!reader) fail('Body required');
 let size=0, chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();fail('Request too large',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Invalid JSON');}
}
export function validateSubmission(b){
 if(!b || typeof b.text!=='string' || b.text.trim().length<3 || b.text.trim().length>5000) fail('Please enter between 3 and 5,000 characters.');
 const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
 if(email && (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))fail('Enter a valid email.');
 if(b.notify===true && !email)fail('Add an email for updates.');
 return {text:b.text.trim(),email:email||null,notify:b.notify===true?1:0};
}
async function digest(s){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
async function admin(req,env){
 if(!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length<32)fail('Admin access is not configured.',503);
 const a=await digest(req.headers.get('authorization')||'');const b=await digest('Bearer '+env.ADMIN_TOKEN);
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff)fail('Sign in required',401);
}
async function linear(env,query,variables){
 if(!env.LINEAR_API_KEY)fail('Linear is not connected yet.',503);
 const r=await fetch('https://api.linear.app/graphql',{method:'POST',headers:{'Content-Type':'application/json',Authorization:env.LINEAR_API_KEY},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)fail('Linear request failed. Check the connection.',502);
 const d=await r.json();if(d.errors?.length)fail('Linear could not complete this request. Review the item before retrying.',502);return d.data;
}
async function route(req,env){
 const u=new URL(req.url),p=u.pathname,db=env.DB;
 if(p.startsWith('/api/feedback/')){
  const project=await db.prepare('SELECT * FROM projects WHERE id=?').bind(p.split('/').pop()).first();
  if(!project)fail('Unknown project',404);
  const origin=req.headers.get('origin');
  if(origin!==project.origin)fail('This website is not registered for this project.',403);
  const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   if(req.method!=='POST')fail('Method not allowed',405);
   const b=await body(req);if(b.website) return json({ok:true},201,cors);
   const v=validateSubmission(b);
   const hour=Math.floor(Date.now()/3600000);const ip=req.headers.get('CF-Connecting-IP')||'local';
   const hash=Array.from(await digest(project.id+':'+ip+':'+hour)).map(n=>n.toString(16).padStart(2,'0')).join('');
   const rate=await db.prepare('INSERT INTO rate_limits(key,hits,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(hash,Date.now()+7200000).first();
   if(rate.hits>10)fail('Too many submissions. Please try again later.',429);
   const id=crypto.randomUUID();
   await db.batch([
    db.prepare('INSERT INTO ideas(id,project_id,title) VALUES (?,?,?)').bind(id,project.id,v.text.slice(0,120)),
    db.prepare('INSERT INTO submissions(id,idea_id,body,email,notify) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,v.text,v.email,v.notify),
    db.prepare('DELETE FROM rate_limits WHERE expires<?').bind(Date.now())
   ]);return json({ok:true},201,cors);
  }catch(e){return json({error:e.status?e.message:'Could not save feedback. Please try again.'},e.status||500,cors);}
 }
 if(p.startsWith('/api/')){
  await admin(req,env);
  if(p==='/api/projects' && req.method==='GET')return json((await db.prepare('SELECT * FROM projects ORDER BY name').all()).results);
  if(p==='/api/projects' && req.method==='POST'){
   const b=await body(req);let origin;try{origin=new URL(b.origin);}catch{fail('Enter a full website origin.');}
   if(origin.protocol!=='https:' && !(origin.protocol==='http:'&&origin.hostname==='localhost'))fail('Use HTTPS.');
   if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100)fail('Project name required (max 100 characters).');
   const id=crypto.randomUUID();await db.prepare('INSERT INTO projects(id,name,origin,linear_team_id) VALUES (?,?,?,?)').bind(id,b.name.trim(),origin.origin,typeof b.team==='string'?b.team.trim()||null:null).run();return json({id},201);
  }
  if(p==='/api/ideas' && req.method==='GET')return json((await db.prepare('SELECT i.*, p.name project_name, COUNT(s.id) supporters FROM ideas i JOIN projects p ON p.id=i.project_id LEFT JOIN submissions s ON s.idea_id=i.id GROUP BY i.id ORDER BY i.created_at DESC LIMIT 500').all()).results);
  const m=p.match(/^\/api\/ideas\/([^/]+)(?:\/(promote|sync|merge))?$/);
  if(m){
   const idea=await db.prepare('SELECT i.*,p.linear_team_id FROM ideas i JOIN projects p ON p.id=i.project_id WHERE i.id=?').bind(m[1]).first();if(!idea)fail('Not found',404);
   if(!m[2] && req.method==='GET')return json({idea,submissions:(await db.prepare('SELECT * FROM submissions WHERE idea_id=? ORDER BY created_at').bind(idea.id).all()).results});
   if(!m[2] && req.method==='PATCH'){
    const b=await body(req);if(!statuses.includes(b.status)||typeof b.title!=='string'||!b.title.trim()||b.title.length>200)fail('Valid title and status required.');
    await db.prepare('UPDATE ideas SET title=?,status=? WHERE id=?').bind(b.title.trim(),b.status,idea.id).run();return json({ok:true});
   }
   if(m[2]==='merge'&&req.method==='POST'){
    const b=await body(req);const target=await db.prepare('SELECT * FROM ideas WHERE id=?').bind(b.target||'').first();
    if(!target||target.id===idea.id||target.project_id!==idea.project_id)fail('Choose another idea in the same project.');
    if(idea.linear_id||idea.promotion_state!=='idle')fail('Merge before promoting to Linear.');
    await db.batch([db.prepare('UPDATE submissions SET idea_id=? WHERE idea_id=?').bind(target.id,idea.id),db.prepare('DELETE FROM ideas WHERE id=?').bind(idea.id)]);return json({ok:true});
   }
   if(m[2]==='promote'&&req.method==='POST'){
    if(idea.linear_id)return json({url:idea.linear_url});
    if(!env.LINEAR_API_KEY||!idea.linear_team_id)fail('Configure the Linear API key and project team first.',503);
    const lock=await db.prepare("UPDATE ideas SET promotion_state='pending' WHERE id=? AND promotion_state='idle' RETURNING id").bind(idea.id).first();
    if(!lock)fail('Promotion already started. Reconcile in Linear before retrying.',409);
    // A pending lock remains after uncertain errors to prevent duplicate issues.
    const records=(await db.prepare('SELECT body FROM submissions WHERE idea_id=?').bind(idea.id).all()).results;
    const d=await linear(env,'mutation($input:IssueCreateInput!){issueCreate(input:$input){success issue{id url}}}',{input:{teamId:idea.linear_team_id,title:idea.title,description:'MIB reference: '+idea.id+'\n\n'+records.map(s=>s.body).join('\n\n---\n\n').slice(0,20000)}});
    const issue=d.issueCreate?.issue;if(!d.issueCreate?.success||!issue)fail('Promotion needs review in Linear.',502);
    await db.prepare("UPDATE ideas SET linear_id=?,linear_url=?,status='planned',promotion_state='done' WHERE id=?").bind(issue.id,issue.url,idea.id).run();return json({url:issue.url});
   }
   if(m[2]==='sync'&&req.method==='POST'){
    if(!idea.linear_id)fail('No linked Linear issue.');
    const d=await linear(env,'query($id:String!){issue(id:$id){state{type}}}',{id:idea.linear_id});
    const type=d.issue?.state?.type;const status=type==='completed'?'ready':type==='started'?'building':null;
    if(status&&idea.status!=='shipped')await db.prepare('UPDATE ideas SET status=? WHERE id=?').bind(status,idea.id).run();return json({ok:true});
   }
  }
  if(p==='/api/release-preview'&&req.method==='POST'){
   const b=await body(req);if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>100||b.ids.some(i=>typeof i!=='string'))fail('Select 1–100 shipped improvements.');
   const ids=[...new Set(b.ids)],place=ids.map(()=>'?').join(',');
   const ideas=(await db.prepare(`SELECT * FROM ideas WHERE id IN (${place})`).bind(...ids).all()).results;
   if(ideas.length!==ids.length||ideas.some(i=>i.status!=='shipped')||new Set(ideas.map(i=>i.project_id)).size!==1)fail('Select shipped ideas from one project.');
   const rows=(await db.prepare(`SELECT DISTINCT lower(email) email FROM submissions WHERE idea_id IN (${place}) AND notify=1 AND email IS NOT NULL`).bind(...ids).all()).results;
   return json({recipients:rows.map(r=>r.email),subject:'You helped make it better',message:'Thanks for suggesting improvements. This release includes something you asked for.\n\n'+ideas.map(i=>'• '+i.title).join('\n')+'\n\nThanks for helping make it better.',sending_enabled:false});
  }
  fail('Not found',404);
 }
 if(req.method!=='GET'&&req.method!=='HEAD')fail('Method not allowed',405);
 const response=await env.ASSETS.fetch(req);const headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
 if(p.endsWith('.js')){headers.set('Access-Control-Allow-Origin','*');headers.set('Cache-Control','public,max-age=300');}
 else {headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'");}
 return new Response(response.body,{status:response.status,headers});
}
export default {async fetch(req,env){try{return await route(req,env);}catch(e){return json({error:e.status?e.message:'Request failed. Please try again.'},e.status||500);}}};
