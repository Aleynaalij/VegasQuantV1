// Synthetic applicant/admin sessions only; never writes hosted user data.
import assert from 'node:assert/strict';
const pw=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {chromium}=pw.default || pw;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE || process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
const base=process.env.UI_SMOKE_URL || 'http://127.0.0.1:3100';
for(const width of [390,1280]) {
 const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
 await ctx.addInitScript(()=>{localStorage.setItem('vq-app-refresh:00000000-0000-0000-0000-000000000001','gold-2026-10-22-v2');sessionStorage.setItem('vq-prompt-shown','profile');localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'smoke',refresh_token:'smoke',token_type:'bearer',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,user:{id:'00000000-0000-0000-0000-000000000001',aud:'authenticated',role:'authenticated',email:'applicant@example.test',app_metadata:{},user_metadata:{vq_welcome_version:1}}}));});
 const p=await ctx.newPage();await p.clock.install({time:new Date('2026-10-14T02:00:00Z')});let approved=false,ready=true,failed=false,admin=false,queue=true;
 await p.route('**/rest/v1/community_profiles**',r=>r.fulfill({json:{username:'AdminTester',avatar:'data:image/png;base64,iVBORw0KGgo=',region:'Fixture',visible:true}}));
 await p.route('**/rest/v1/rpc/beta_application_status',r=>failed?r.fulfill({status:503,json:{message:'fixture failure'}}):r.fulfill({json:{state:approved?'approved':'pending',approved,onboarding_complete:ready}}));
 await p.route('**/rest/v1/rpc/membership_status',r=>r.fulfill({json:{allowed:approved,admin,admin_account:admin,approval_required:!approved,approval_state:approved?'approved':'pending',member_code:'FIXTURE'}}));
 await p.route('**/rest/v1/rpc/admin_beta_applications',r=>r.fulfill({json:{pending:queue?1:0,applications:queue?[{user_id:'00000000-0000-0000-0000-000000000002',email:'new-member@example.test',username:'NewTester',ready:true,email_confirmed:true,requested_at:'2026-10-22T23:00:00Z'}]:[]}}));
 await p.route('**/rest/v1/rpc/review_beta_application',async r=>{assert.equal(r.request().postDataJSON().p_decision,'approved');queue=false;await r.fulfill({json:{state:'approved'}});});
 await p.goto(base+'/',{waitUntil:'networkidle'});
 await p.getByRole('heading',{name:'Application pending approval',exact:true}).waitFor();
 assert.equal(await p.getByRole('heading',{name:'Find your game. See every pick.'}).count(),0,'private app unmounted');
 assert.equal(await p.locator('dialog[open]').count(),0,'optional prompts do not cover waiting state');
 await p.screenshot({path:`/tmp/beta-pending-${width}.png`});
 failed=true;await p.getByRole('button',{name:'Check status',exact:true}).click();
 await p.getByRole('heading',{name:'We couldn’t check your application'}).waitFor();
 failed=false;ready=false;await p.getByRole('button',{name:'Check status',exact:true}).click();
 await p.getByRole('heading',{name:'Finish your application'}).waitFor();
 assert.equal(await p.getByLabel('Username').count()>0,true,'profile editor remains accessible');
 ready=true;approved=true;await p.getByRole('button',{name:'Check status',exact:true}).click();
 await p.clock.runFor(1500);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await p.getByRole('heading',{name:'Find your game. See every pick.',exact:true}).waitFor();
 // Avoid unrelated profile/push dialogs while exercising only the admin queue.
 await p.route('**/rest/v1/community_profiles**',r=>r.fulfill({json:{username:'AdminTester',avatar:'data:image/png;base64,iVBORw0KGgo=',region:'Fixture',visible:true}}));
 admin=true;await p.goto(base+'/membership',{waitUntil:'networkidle'});
 await p.getByRole('heading',{name:'Account approval queue · 1'}).waitFor();
 await p.clock.runFor(1500);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await p.getByRole('region',{name:'Account approval queue'}).scrollIntoViewIfNeeded();
 await p.screenshot({path:`/tmp/beta-admin-${width}.png`});
 await p.getByRole('button',{name:'Approve access',exact:true}).click();
 await p.getByText('No applications waiting for review.',{exact:true}).waitFor();
 assert.match(await p.getByRole('region',{name:'Account approval queue'}).innerText(),/NewTester approved/);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth<=1),true,'no horizontal overflow');
 await ctx.close();
}
await browser.close();console.log('Applicant/setup/error/approval/admin queue verified at 390 and 1280.');
