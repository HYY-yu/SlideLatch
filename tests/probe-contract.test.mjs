import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {createBoundaryProbes,inspectWorkspace} from '../lib/workflow/session.ts';
import {bestComponentAssignment,MAX_MATCH_COMPONENTS} from '../packages/ppt-dsl/src/component-matching.ts';
import {meaningfulTextLength} from '../packages/ppt-dsl/src/text-length.ts';
import {readSourceSlides} from '../lib/pptx/xml.ts';
Object.assign(globalThis,{DOMParser,XMLSerializer});
function grouped(fixed=false,reversed=true){
 const path='ppt/slides/slide1.xml';
 const node=(id,name,parentId,width,text='')=>({id,key:`${path}#${id}`,slidePath:path,name,parentId,kind:parentId?'sp':'grpSp',children:[],box:{x:0,y:0,width,height:10},childBox:parentId?null:{x:0,y:0,width:100,height:10},rotation:0,flipH:false,flipV:false,text,marked:true,hasTextBody:!!parentId});
 const nodes=[node('2',fixed?'@1@1':'@1@1[1-3]',null,100),node('3','@文本[1-10]','2',10,'短文'),node('4','@文本[20-40]','2',100,'这里是用于匹配的比较长的描述文本，保持语义内容。'),node('5','@1@2',null,100)];
 const later=[node('6','@文本','5',10,'短文'),node('7','@文本','5',100,'这里是用于匹配的比较长的描述文本，保持语义内容。')];nodes.push(...(reversed?later.reverse():later));
 nodes[0].children=['3','4'];nodes[3].children=['6','7'];
 return {bytes:new ArrayBuffer(0),sha256:'0'.repeat(64),slides:[{path,nodes}],mappingWarnings:[],deck:{slides:[{elements:nodes.map(n=>({id:n.id,type:'text',left:0,top:0,width:10,height:10}))}],size:{width:960,height:540},themeColors:[]}};
}
test('fixed native groups emit compiler-required count endpoints',()=>{
 const probes=createBoundaryProbes(grouped(true,false),{},'s').filter(p=>p.kind==='list');
 assert.deepEqual(probes.map(p=>[p.boundary,p.value]),[['min',2],['max',2]]);
});
test('reordered same-kind fields inherit the shared geometric contract, not XML order',async()=>{
 const model=grouped(),probes=createBoundaryProbes(model,{},'s');
 for(const [id,min,max]of [['6',1,10],['7',20,40]])assert.deepEqual(probes.filter(p=>p.key.endsWith('#'+id)).map(p=>p.value),[min,max]);
 assert.deepEqual((await inspectWorkspace(model,{})).issues,[]);
});
test('component matching rejects excessive same-kind fields before factorial expansion',()=>{
 const one={sampleContent:'x',locator:{box:{cx:10,cy:10}}};
 assert.throws(()=>bestComponentAssignment(Array(MAX_MATCH_COMPONENTS+1).fill(one),Array(MAX_MATCH_COMPONENTS+1).fill(one)),/COMPONENT_MATCH_LIMIT/);
 assert.equal(bestComponentAssignment([one,one],[one,one]).ambiguous,true);
});
test('all real template boundary samples count to the exact runtime boundary, including slide25 shape4',async()=>{
 const bytes=await readFile(new URL('../public/demo/minimal-business/minimal-business-original.pptx',import.meta.url)),slides=await readSourceSlides(bytes);
 const model={bytes:bytes.buffer,slides,sha256:'0'.repeat(64),mappingWarnings:[],deck:{slides:[],size:{width:960,height:540},themeColors:[]}};
 const probes=createBoundaryProbes(model,{},'s').filter(p=>p.kind==='text');assert.ok(probes.length>100);
 for(const p of probes){const metric=meaningfulTextLength(p.text);assert.equal(metric.length,p.value,p.id);assert.equal(metric.hasInvalidCharacters,false,p.id);}
 const target=probes.find(p=>p.key==='ppt/slides/slide25.xml#4'&&p.value===50);assert.equal(target.value,50);assert.equal(meaningfulTextLength(target.text).length,50);
});
