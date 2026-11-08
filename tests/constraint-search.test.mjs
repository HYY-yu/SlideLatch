import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTextCapacity, stressText, MAX_SEARCH_WINDOW } from '../lib/workflow/constraint-search.ts';
import { measurePreviewText } from '../lib/workflow/measure-preview.ts';
const input={snapshotId:'snapshot',key:'slide#text',lower:1,upper:6,samples:[{id:'semantic',seed:'Revenue增长😀'}]};
const evidence=fits=>({fits,reason:'Deterministic test measurement'});
test('exhaustive search retains non-monotone ranges and conservative prefix',async()=>{
 const seen=[];
 const report=await searchTextCapacity(input,{measure:async c=>{seen.push(c);return evidence(c.length!==3&&c.length!==5);}});
 assert.equal(report.status,'complete');assert.equal(report.visualGuarantee,false);
 assert.equal(seen.length,18);assert.equal(report.candidates.length,18);
 assert.deepEqual(report.feasibleRanges,[{min:1,max:2},{min:4,max:4},{min:6,max:6}]);assert.equal(report.recommendedMax,2);
 assert.ok(seen.every(c=>Array.from(c.text).length===c.length));
 assert.deepEqual(new Set(seen.map(c=>c.sampleId)),new Set(['semantic','cjk-wide','latin-wide']));
});
test('all families must fit, failure at supplied minimum gives no recommended maximum',async()=>{
 const report=await searchTextCapacity(input,{measure:async c=>evidence(c.length!==1||c.sampleId!=='latin-wide')});
 assert.deepEqual(report.feasibleRanges,[{min:2,max:6}]);assert.equal(report.recommendedMax,null);assert.equal(report.lower,1);
});
test('unknown and thrown measurements are inconclusive, never passing',async()=>{
 const report=await searchTextCapacity(input,{measure:async c=>{if(c.length===2)throw new Error('No geometry');return evidence(c.length===3?null:true);}});
 assert.equal(report.status,'inconclusive');assert.equal(report.recommendedMax,null);
 assert.equal(report.candidates.length,18);assert.equal(report.candidates[3].evidence.fits,null);
 assert.deepEqual(report.feasibleRanges,[{min:1,max:1},{min:4,max:6}]);
});
test('malformed bounds and oversized workloads fail before measurement',async()=>{
 for(const bounds of [{lower:-1},{upper:0},{lower:1.2},{upper:Infinity},{upper:10001},{upper:MAX_SEARCH_WINDOW+1}]){
  await assert.rejects(searchTextCapacity({...input,...bounds},{measure:async()=>{throw new Error('must not run');}}),/SEARCH_INVALID_BOUNDS/);
 }
 await assert.rejects(searchTextCapacity({...input,samples:Array(7).fill({id:'x',seed:'x'})},{measure:async()=>evidence(true)}),/SEARCH_INVALID_SAMPLES/);
});
test('abort before and during callback stops all subsequent renderer work',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const first=await searchTextCapacity(input,{signal:controller.signal,measure:async()=>{calls++;return evidence(true);}});
 assert.equal(first.status,'cancelled');assert.equal(calls,0);
 const during=new AbortController();
 const second=await searchTextCapacity(input,{signal:during.signal,measure:async()=>{calls++;during.abort();return evidence(true);}});
 assert.equal(second.status,'cancelled');assert.equal(calls,1);assert.equal(second.candidates.length,1);assert.equal(second.candidates[0].evidence.fits,null);assert.equal(second.recommendedMax,null);
});
test('stale snapshot before and after await invalidates results',async()=>{
 let current=true;
 const report=await searchTextCapacity(input,{isCurrent:()=>current,measure:async()=>{current=false;return evidence(true);}});
 assert.equal(report.status,'stale');assert.equal(report.candidates.length,1);assert.equal(report.candidates[0].evidence.fits,null);
 const initial=await searchTextCapacity(input,{isCurrent:()=>false,measure:async()=>{throw new Error('must not run');}});
 assert.equal(initial.status,'stale');assert.equal(initial.candidates.length,0);
});
test('stress strings have exact Unicode codepoint lengths without invisible padding',()=>{
 for(const seed of ['收入增长','MW','😀Revenue','a\u200b b\n'])for(const length of [0,1,2,11,128]){
  const value=stressText(seed,length);assert.equal(Array.from(value).length,length);assert.doesNotMatch(value,/[\p{C}\p{Z}\s]/u);
 }
 assert.throws(()=>stressText('\u200b \n',3),/SEARCH_INVALID_SAMPLE/);
});
test('DOM helper does not pass unknown or disconnected geometry',async()=>{
 assert.equal((await measurePreviewText({isConnected:false},'x')).fits,null);
 assert.equal((await measurePreviewText({isConnected:true,ownerDocument:{defaultView:{}}},'x')).fits,null);
 const signal=AbortSignal.abort();assert.equal((await measurePreviewText(null,'x',{signal})).reason,'cancelled');
});
function previewFixture({scale=2,inkTop=0,scrollHeight=50,scope='page-text',rotated=false}={}){
 const rect={left:0,right:100*scale,top:0,bottom:50*scale,width:100*scale,height:50*scale};
 const inner={...rect,top:inkTop*scale,bottom:(50+inkTop)*scale};
 const content={textContent:'text',getBoundingClientRect:()=>inner,scrollWidth:100,scrollHeight:50,clientWidth:100,clientHeight:50};
 const box={contains:x=>x===content,getBoundingClientRect:()=>rect,scrollWidth:100,scrollHeight,clientWidth:100,clientHeight:50};
 const foreign={getAttribute:name=>name==='data-workflow-node-key'?'x':scope,querySelector:selector=>selector.includes('text-box')?box:content,
  getScreenCTM:()=>({a:scale,b:rotated?1:0,c:0,d:scale}),getBoundingClientRect:()=>rect};
 return {isConnected:true,querySelectorAll:()=>[foreign],ownerDocument:{fonts:{ready:Promise.resolve(),status:'loaded'},
  defaultView:{requestAnimationFrame:fn=>queueMicrotask(fn),getComputedStyle:()=>({display:'flex',visibility:'visible',opacity:'1',paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0'})},
  createRange:()=>({selectNodeContents(){},getClientRects:()=>[inner],detach(){}})}};
}
test('DOM evidence normalizes actual SVG scale and observes fitting bounds',async()=>{
 const result=await measurePreviewText(previewFixture(),'x');
 assert.equal(result.fits,true);assert.equal(result.width,100);assert.equal(result.height,50);assert.equal(result.contentHeight,50);assert.equal(result.scaleX,2);
});
test('DOM evidence catches negative centered clipping and scroll overflow',async()=>{
 const clipped=await measurePreviewText(previewFixture({inkTop:-4}),'x');assert.equal(clipped.fits,false);assert.equal(clipped.boundsOverflow,true);
 const scroll=await measurePreviewText(previewFixture({scrollHeight:60}),'x');assert.equal(scroll.fits,false);assert.equal(scroll.scrollOverflow,true);
});
test('DOM evidence refuses unsupported scope or rotated geometry',async()=>{
 assert.equal((await measurePreviewText(previewFixture({scope:'group-text'}),'x')).fits,null);
 assert.equal((await measurePreviewText(previewFixture({rotated:true}),'x')).fits,null);
});

test('visible inner overflow is not clipping when the outer text box still contains it',async()=>{
 const root=previewFixture();const foreign=root.querySelectorAll()[0],content=foreign.querySelector('[data-workflow-text-content]');
 content.clientHeight=40;content.scrollHeight=50;
 const result=await measurePreviewText(root,'x');assert.equal(result.fits,true);assert.equal(result.scrollOverflow,false);assert.equal(result.contentScrollOverflow,true);
});

test('font range whitespace overhang is reported separately from block-layout capacity',async()=>{
 const root=previewFixture();root.ownerDocument.createRange=()=>({selectNodeContents(){},getClientRects:()=>[{left:0,right:20,top:-4,bottom:25,width:20,height:29}],detach(){}});
 const result=await measurePreviewText(root,'x');assert.equal(result.fits,true);assert.equal(result.textRangeOverflow,true);assert.equal(result.requiresVisualReview,true);assert.equal(result.fitKind,'block-layout-only');
});
