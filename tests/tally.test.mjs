import test from 'node:test';
import assert from 'node:assert/strict';
import {createTallyLifecycle,trialFormId,defaultTrialFormId,loadTallySDK} from '../lib/engagement/tally.ts';
import {analyticsEvents,safeProperties} from '../lib/analytics/events.ts';
test('the published Tally form ID defaults correctly and rejects URLs or invalid IDs',()=>{
 assert.equal(trialFormId(undefined),'7XqVaa');assert.equal(trialFormId(' 7XqVaa '),defaultTrialFormId);
 for(const value of ['https://tally.so/r/7XqVaa','../form','<script>','abc'])assert.throws(()=>trialFormId(value));
});
test('CTA or close never means submitted; opened and closed events are deduplicated',()=>{
 const events=[],flow=createTallyLifecycle(defaultTrialFormId,'header','en',(event,props)=>events.push({event,props}));
 assert.equal(flow.onSubmit({formId:defaultTrialFormId}),false);assert.equal(events.length,0);
 flow.onOpen();flow.onOpen();flow.onClose();flow.onClose();
 assert.deepEqual(events.map(e=>e.event),['survey_form_opened','survey_form_closed']);
 assert.equal(events[1].props.outcome,'abandoned');
 assert.equal(flow.onSubmit({formId:defaultTrialFormId}),false);
});
test('a valid submission callback emits once and never forwards any answers or identities',()=>{
 const events=[],flow=createTallyLifecycle(defaultTrialFormId,'support_survey','zh',(event,props)=>events.push({event,props}));
 flow.onOpen();const payload={formId:defaultTrialFormId,id:'private-submission-id',respondentId:'private-person',formName:'private name',fields:[{title:'邮箱',answer:{value:'private@example.com'}}]};
 assert.equal(flow.onSubmit(payload),true);assert.equal(flow.onSubmit(payload),false);flow.onClose();
 assert.deepEqual(events.map(e=>e.event),['survey_form_opened','survey_submitted','survey_form_closed']);
 assert.equal(events.at(-1).props.outcome,'submitted');
 assert.ok(!JSON.stringify(events).includes('private'));assert.ok(events.every(e=>analyticsEvents.includes(e.event)));
 assert.deepEqual(safeProperties(events[1].props),{form_id:defaultTrialFormId,entry_point:'support_survey',locale:'zh'});
});
test('another form cannot mark the configured form as submitted',()=>{
 const events=[],flow=createTallyLifecycle(defaultTrialFormId,'results','zh',event=>events.push(event));flow.onOpen();
 assert.equal(flow.onSubmit({formId:'OTHER1',fields:[{answer:'secret'}]}),false);
 assert.equal(flow.onSubmit(null),false);assert.deepEqual(events,['survey_form_opened']);
});

test('the widget loader shares a pending script and can retry after a network failure',async()=>{
 const savedWindow=globalThis.window,savedDocument=globalThis.document,scripts=[];
 globalThis.window={};globalThis.document={createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:script=>scripts.push(script)}};
 try{
  const first=loadTallySDK(),same=loadTallySDK();assert.equal(first,same);assert.equal(scripts.length,1);
  scripts[0].onerror();await assert.rejects(first,/TALLY_SCRIPT_LOAD_FAILED/);assert.equal(scripts[0].removed,true);
  const retry=loadTallySDK();assert.equal(scripts.length,2);const sdk={openPopup(){},closePopup(){}};globalThis.window.Tally=sdk;
  scripts[1].onload();assert.equal(await retry,sdk);assert.equal(await loadTallySDK(),sdk);assert.equal(scripts.length,2);
 }finally{globalThis.window=savedWindow;globalThis.document=savedDocument;}
});
