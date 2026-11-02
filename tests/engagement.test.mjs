import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySupport,likeSupport,dismissSupportInvitation,restoreSupport,serializeSupport} from '../lib/engagement/support.ts';
import {createAnalytics,resolveAnalyticsConfig} from '../lib/analytics/core.ts';
import {safeProperties,sanitizeSdkProperties} from '../lib/analytics/events.ts';
const logger=()=>{const logs=[];return {logs,debug:(...v)=>logs.push(v),warn:(...v)=>logs.push(v),info:(...v)=>logs.push(v)};};
test('survey invitation opens on the fourth like, never on the first three, without mutating previous state',()=>{
 let state={...emptySupport};for(let n=1;n<=3;n++){state=likeSupport(state);assert.equal(state.likes,n);assert.equal(state.invitationOpen,false);}
 const fourth=likeSupport(state);assert.equal(fourth.likes,4);assert.equal(fourth.invitationOpen,true);assert.equal(fourth.prompted,true);assert.equal(state.likes,3);
});
test('declining or accepting an invitation suppresses later invitations for the browser session',()=>{
 let state={likes:4,prompted:true,invitationOpen:true};state=dismissSupportInvitation(state);
 for(let i=0;i<30;i++)state=likeSupport(state);
 assert.equal(state.likes,34);assert.equal(state.invitationOpen,false);
 const restored=restoreSupport(serializeSupport({...state,invitationOpen:true}));assert.equal(restored.likes,34);assert.equal(restored.invitationOpen,false);assert.equal(likeSupport(restored).invitationOpen,false);
 assert.equal(likeSupport({...emptySupport}).likes,1);
 assert.equal(likeSupport({likes:Number.MAX_SAFE_INTEGER,prompted:true,invitationOpen:false}).likes,Number.MAX_SAFE_INTEGER);
});
test('malformed session data is rejected rather than causing invalid counts or repeated prompts',()=>{
 for(const raw of ['bad','{}','null','{"likes":-1,"prompted":false}','{"likes":1.5,"prompted":false}','{"likes":"4","prompted":false}'])assert.throws(()=>restoreSupport(raw));
 assert.deepEqual(restoreSupport(null),emptySupport);
});
test('analytics stays off without project configuration or on localhost unless explicitly enabled',()=>{
 const base={key:'public-test-token',host:'https://us.i.posthog.com',hostname:'example.com',environment:'production'};
 assert.equal(resolveAnalyticsConfig(base).enabled,true);
 assert.equal(resolveAnalyticsConfig({...base,key:''}).enabled,false);
 assert.equal(resolveAnalyticsConfig({...base,hostname:'127.0.0.1'}).enabled,false);
 assert.equal(resolveAnalyticsConfig({...base,hostname:'localhost',captureLocal:true}).enabled,true);
 for(const host of ['http://example.com','https://user:pass@example.com','https://example.com?email=private','bad'])assert.equal(resolveAnalyticsConfig({...base,host}).enabled,false);
});
test('event properties exclude private content and strip SDK URL/referrer dimensions',()=>{
 assert.deepEqual(safeProperties({locale:'zh',like_count:4,entry_point:'results',email:'private@example.com',content:'private PPT',page_path:'/zh?email=secret',constructor:'x',feature:'other',case_id:'growth'}),{locale:'zh',like_count:4,entry_point:'results',case_id:'growth'});
 assert.deepEqual(sanitizeSdkProperties({$current_url:'https://x?email=private',$referrer:'https://x?secret=private',$initial_current_url:'secret',utm_source:'sensitive',distinct_id:'anonymous-id',locale:'en'}),{distinct_id:'anonymous-id',locale:'en'});
});
test('events queue during SDK loading, deduplicate views, and deliver only sanitized dimensions',async()=>{
 const delivered=[],log=logger();let resolve;
 const loaded=new Promise(r=>{resolve=r;});
 const analytics=createAnalytics({enabled:true,debug:true},()=>loaded,log);
 analytics.captureOnce('landing','landing_viewed',{locale:'zh',email:'private@example.com'});
 analytics.captureOnce('landing','landing_viewed',{locale:'zh'});
 analytics.capture('support_clicked',{like_count:4,content:'PPT secret'});
 resolve({capture:(...args)=>delivered.push(args)});await analytics.start();
 assert.deepEqual(delivered,[['landing_viewed',{locale:'zh'}],['support_clicked',{like_count:4}]]);
 assert.ok(!JSON.stringify(log.logs).includes('private@example.com'));assert.ok(!JSON.stringify(log.logs).includes('PPT secret'));
});
test('missing configuration and failed analytics initialization never block product interactions',async()=>{
 let loads=0;const off=createAnalytics({enabled:false,debug:false},async()=>{loads++;throw Error('unexpected');},logger());off.capture('support_clicked',{like_count:1});await off.start();assert.equal(loads,0);
 const log=logger(),failed=createAnalytics({enabled:true,debug:false},async()=>{throw Error('SDK unavailable');},log);
 failed.capture('support_clicked',{like_count:1});await failed.start();assert.doesNotThrow(()=>failed.capture('trial_cta_clicked',{entry_point:'header'}));assert.ok(JSON.stringify(log.logs).includes('analytics.init.failed'));
 const broken=createAnalytics({enabled:true,debug:false},async()=>({capture:()=>{throw Error('blocked');}}),log);await broken.start();assert.doesNotThrow(()=>broken.capture('support_clicked'));assert.ok(JSON.stringify(log.logs).includes('analytics.capture.failed'));
});
