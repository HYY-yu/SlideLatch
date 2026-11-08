import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { readSourceSlides, writePptx, NS } from '../lib/pptx/xml.ts';
import { inverse, point, worldFrame, parentMatrix, multiply } from '../lib/pptx/geometry.ts';
import { parseMark, markName, markError } from '../lib/pptx/dsl.ts';
import {validateWorkspace} from '../lib/pptx/validation.ts';

globalThis.DOMParser=DOMParser;
globalThis.XMLSerializer=XMLSerializer;
const original=readFileSync(new URL('../public/demo/minimal-business/minimal-business-original.pptx',import.meta.url));
const slides=await readSourceSlides(original);

function writeTestPptx(t,name,bytes){
 const directory=mkdtempSync(join(tmpdir(),'slidelatch-pptx-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const artifact=join(directory,name);
 writeFileSync(artifact,bytes);
 assert.deepEqual(readFileSync(artifact),Buffer.from(bytes));
}

test('all 33 slides and all 279 marked components retain their original OOXML identity',()=>{
 assert.equal(slides.length,33);
 const marked=slides.flatMap(slide=>slide.nodes).filter(node=>node.marked&&node.kind!=='grpSp');
 assert.equal(marked.length,279);
 assert.ok(marked.every(node=>node.id&&node.key===`${node.slidePath}#${node.id}`));
 assert.ok(slides[2].nodes.some(n=>n.kind==='grpSp'&&n.name==='@1@1[3-5]'));
});

test('patches round-trip names, sizes and group-local positions while retaining every untouched ZIP part',async t=>{
 const title=slides[0].nodes.find(n=>n.id==='3');
 const group=slides[2].nodes.find(n=>n.name==='@1@1[3-5]');
 const child=slides[2].nodes.find(n=>n.parentId===group.id&&n.name.startsWith('@文本'));
 const chart=slides[21].nodes.find(n=>n.name==='@图表');
 const table=slides[24].nodes.find(n=>n.name==='@表格');
 const photo=slides[25].nodes.find(n=>n.name==='@图片-1');
 const patches={
  [title.key]:{name:'@文本[3-8]',box:{...title.box,x:title.box.x+5,width:title.box.width-8}},
  [group.key]:{box:{...group.box,width:group.box.width+20}},
  [child.key]:{box:{...child.box,x:child.box.x+3}},
  [chart.key]:{box:{...chart.box,x:chart.box.x+2}},
  [table.key]:{box:{...table.box,width:table.box.width-5,height:table.box.height+10}},
  [photo.key]:{box:{...photo.box,height:photo.box.height-3}},
 };
 const result=await writePptx(original,patches),read=await readSourceSlides(result);
 for(const [key,patch]of Object.entries(patches)){
  const node=read.flatMap(s=>s.nodes).find(n=>n.key===key);assert.ok(node);
  if(patch.name)assert.equal(node.name,patch.name);
  if(patch.box)for(const k of Object.keys(patch.box))assert.ok(Math.abs(node.box[k]-patch.box[k])<=1/12700+.000001,`${key}:${k}`);
 }
 const before=await JSZip.loadAsync(original),after=await JSZip.loadAsync(result);
 const tableDoc=new DOMParser().parseFromString(await after.file(table.slidePath).async('string'),'application/xml');
 const sum=(tag,attribute)=>Array.from(tableDoc.getElementsByTagNameNS(NS.a,tag)).reduce((total,node)=>total+Number(node.getAttribute(attribute)),0);
 assert.equal(sum('gridCol','w'),Math.round(patches[table.key].box.width*12700));
 assert.equal(sum('tr','h'),Math.round(patches[table.key].box.height*12700));
 assert.deepEqual(Object.keys(after.files).sort(),Object.keys(before.files).sort());
 const changedParts=new Set(Object.keys(patches).map(key=>key.split('#')[0]));
 for(const path of Object.keys(before.files))if(!before.files[path].dir&&!changedParts.has(path))assert.deepEqual(await after.file(path).async('uint8array'),await before.file(path).async('uint8array'),path);
 for(const path of changedParts){
  const left=new DOMParser().parseFromString(await before.file(path).async('string'),'application/xml');
  const right=new DOMParser().parseFromString(await after.file(path).async('string'),'application/xml');
  const texts=doc=>Array.from(doc.getElementsByTagNameNS(NS.a,'t')).map(n=>n.textContent);
  assert.deepEqual(texts(left),texts(right));
 }
 writeTestPptx(t,'slidelatch-roundtrip.pptx',result);
});

test('invalid patches fail explicitly instead of corrupting the package',async()=>{
 await assert.rejects(writePptx(original,{'ppt/slides/slide1.xml#999999':{name:'@文本[2-8]'}}),/PATCH_SHAPE/);
 await assert.rejects(writePptx(original,{'ppt/slides/slide1.xml#3':{box:{x:1,y:2,width:-1,height:3}}}),/PATCH_GEOMETRY/);
 await assert.rejects(writePptx(original,{'../bad.xml#3':{name:'bad'}}),/PATCH_TARGET/);
});

test('nested group matrices are invertible and follow changed parent geometry',()=>{
 const nodes=slides[2].nodes,group=nodes.find(n=>n.name==='@1@1[3-5]'),child=nodes.find(n=>n.parentId===group.id&&n.name.startsWith('@文本'));
 const initial=worldFrame(child,nodes,{}),a=point(initial,0,0),local=point(inverse(initial),a.x,a.y);
 assert.ok(Math.abs(local.x)<1e-8&&Math.abs(local.y)<1e-8);
 const patches={[group.key]:{box:{...group.box,x:group.box.x+10,width:group.box.width*1.2}}};
 const changed=worldFrame(child,nodes,patches);assert.notDeepEqual(initial,changed);
 const identity=multiply(inverse(parentMatrix(child,nodes,patches)),parentMatrix(child,nodes,patches));
 assert.ok(Math.abs(identity[0]-1)<1e-9&&Math.abs(identity[5])<1e-9);
});

test('DSL names retain list membership and expose all supported mark types',()=>{
 assert.equal(markName({...parseMark('@1@2 文本'),min:4,max:12},'@1@2 文本',false),'@1@2 文本[4-12]');
 assert.equal(markName({...parseMark('@1@1[3-5]'),min:4,max:5},'@1@1[3-5]',true),'@1@1[4-5]');
 for(const name of ['@文本[2-8]','@图片-1','@序号-01','@图标','@背景','@表格','@图表','@1@1[3-5]'])assert.notEqual(parseMark(name).type,'raw');
 assert.equal(markError({...parseMark('@文本[2-8]'),min:9,max:8}),true);
});


test('workspace validation accepts the real template and rejects broken list structures',()=>{
 assert.deepEqual(validateWorkspace(slides,{}),[]);
 const group=slides[2].nodes.find(n=>n.name==='@1@1[3-5]');
 assert.ok(validateWorkspace(slides,{[group.key]:{name:'@1@1[6-8]'}}).some(issue=>issue.includes('ITEM_RANGE')));
 const next=slides[2].nodes.find(n=>n.name==='@1@2');
 assert.ok(validateWorkspace(slides,{[next.key]:{name:'@1@9'}}).some(issue=>issue.includes('ITEM_SEQUENCE')));
 const child=slides[2].nodes.find(n=>n.parentId===next.id&&n.name.startsWith('@文本'));
 assert.ok(validateWorkspace(slides,{[child.key]:{name:'fixed-content'}}).some(issue=>issue.includes('ITEM_COMPONENTS_MISMATCH')));
 assert.equal(parseMark('@1@2文本[10-100]').type,'text');
});

test('slide 17/18 trapezoids stay inside their boxes and gradient stops remain numeric',async()=>{
 const {presetPath,gradientOffset}=await import('../lib/pptx/render-geometry.ts');
 const trapezoids=[...slides[16].nodes,...slides[17].nodes].filter(n=>n.geometry?.preset==='trapezoid');
 assert.equal(trapezoids.length,10);
 for(const node of trapezoids){
  const {width,height}=node.box;
  const coords=presetPath(node.geometry,width,height).match(/-?\d+(?:\.\d+)?/g).map(Number);
  for(let i=0;i<coords.length;i+=2){assert.ok(coords[i]>=0&&coords[i]<=width);assert.ok(coords[i+1]>=0&&coords[i+1]<=height);}
 }
 const last=trapezoids.at(-1),inset=last.box.height*1.67953;
 assert.ok(Math.abs(Number(presetPath(last.geometry,last.box.width,last.box.height).split(' ')[1])-inset)<1e-8);
 assert.equal(gradientOffset('0%'),0);assert.equal(gradientOffset('100%'),1);assert.equal(gradientOffset('50%'),.5);assert.equal(gradientOffset(.25),.25);
});

test('text length previews deduplicate phrases, repeat by code point, and allow zero and large DSL ranges',async()=>{
 const {uniqueNodeContent,previewText}=await import('../lib/pptx/text-preview.ts');
 assert.equal(uniqueNodeContent('标题标题'),'标题');
 assert.equal(uniqueNodeContent('内容内容内容'),'内容');
 assert.equal(uniqueNodeContent('内容内容内'),'内容');
 assert.equal(uniqueNodeContent('年度工作总结'),'年度工作总结');
 assert.equal(uniqueNodeContent('人人有责'),'人人有责');
 assert.equal(uniqueNodeContent('😀标题😀标题'),'😀标题');
 assert.equal(previewText('标题',3),'标题标');
 assert.equal(previewText('标题',1),'标');
 assert.equal(previewText('标题',0),'');
 assert.equal(previewText('标题',10),'标题标题标题标题标题');
 assert.equal(previewText('😀标题',4),'😀标题😀');
 assert.equal(markError(parseMark('@文本[0-0]')),false);
 assert.equal(markError(parseMark('@文本[0-50000]')),false);
 assert.equal(markError(parseMark('@任意标签')),true);
 assert.throws(()=>markName(parseMark('@任意标签'),'@任意标签',false),/UNSUPPORTED_MARK/);
 const title=slides[0].nodes.find(n=>n.id==='3');
 const result=await readSourceSlides(await writePptx(original,{[title.key]:{name:'@文本[0-50000]'}}));
 const exported=result[0].nodes.find(n=>n.id==='3');
 assert.equal(exported.text,title.text);
 assert.equal(exported.name,'@文本[0-50000]');
});

test('edited semantic node content round-trips with line breaks, XML escaping and first-run styling',async()=>{
 const title=slides[0].nodes.find(n=>n.id==='3');
 const text='年度营收 <增长> & 客户😀\n填写本年度收入与同比增长率';
 const bytes=await writePptx(original,{[title.key]:{text}});
 const read=await readSourceSlides(bytes);
 assert.equal(read[0].nodes.find(n=>n.id==='3').text,text);
 for(const node of slides.flatMap(s=>s.nodes))if(node.key!==title.key)assert.equal(read.flatMap(s=>s.nodes).find(n=>n.key===node.key).text,node.text,node.key);
 const before=await JSZip.loadAsync(original),after=await JSZip.loadAsync(bytes);
 const getStyle=async zip=>{
  const doc=new DOMParser().parseFromString(await zip.file(title.slidePath).async('string'),'application/xml');
  const props=Array.from(doc.getElementsByTagNameNS(NS.p,'cNvPr')).find(n=>n.getAttribute('id')===title.id);
  const shape=props.parentNode.parentNode;
  return ['bodyPr','pPr','rPr'].map(tag=>new XMLSerializer().serializeToString(shape.getElementsByTagNameNS(NS.a,tag)[0]));
 };
 assert.deepEqual(await getStyle(after),await getStyle(before));
 for(const path of Object.keys(before.files))if(!before.files[path].dir&&path!==title.slidePath)assert.deepEqual(await after.file(path).async('uint8array'),await before.file(path).async('uint8array'),path);
 assert.equal((await readSourceSlides(await writePptx(original,{[title.key]:{text:''}})))[0].nodes.find(n=>n.id===title.id).text,'');
 const table=slides[24].nodes.find(n=>n.name==='@表格');
 await assert.rejects(writePptx(original,{[table.key]:{text:'invalid'}}),/PATCH_TEXT_TARGET/);
 await assert.rejects(writePptx(original,{[title.key]:{text:'invalid\u0000'}}),/PATCH_TEXT/);
});

test('tags can be removed and added independently of object content, with compatible OOXML types only',async()=>{
 const {addedMarkName,allowedMarkTypes,removedMarkName}=await import('../lib/pptx/marking.ts');
 const title=slides[0].nodes.find(n=>n.id==='2');
 const photo=slides[0].nodes.find(n=>n.name==='@图片-1');
 assert.deepEqual(allowedMarkTypes(title),['text','number']);
 assert.deepEqual(allowedMarkTypes(photo),['image','icon','background']);
 assert.equal(allowedMarkTypes(slides[24].nodes.find(n=>n.name==='@表格'))[0],'table');
 const removed=removedMarkName(title);
 assert.equal(removed.startsWith('@'),false);
 const patches={[title.key]:{name:removed}};
 assert.equal(validateWorkspace(slides,patches).length,0);
 const untagged=await readSourceSlides(await writePptx(original,patches));
 const written=untagged[0].nodes.find(n=>n.id===title.id);
 assert.equal(written.marked,false);assert.equal(written.text,title.text);assert.deepEqual(written.box,title.box);
 const added=addedMarkName(written,untagged[0].nodes,{});
 assert.equal(parseMark(added).type,'text');
 const retagged=await readSourceSlides(await writePptx(original,{[title.key]:{name:added}}));
 assert.equal(retagged[0].nodes.find(n=>n.id===title.id).marked,true);
 const design=slides[0].nodes.find(n=>!n.marked&&n.hasTextBody);
 if(design)assert.equal(removedMarkName(design),design.name);
 assert.ok(validateWorkspace(slides,{[title.key]:{name:'@图片-9'}}).some(issue=>issue.endsWith('MARK_TYPE_MISMATCH')));
 assert.ok(validateWorkspace(slides,{[photo.key]:{name:'@文本[2-24]'}}).some(issue=>issue.endsWith('MARK_TYPE_MISMATCH')));
});

test('workspace undo/redo matches common Mac and Windows shortcuts without capturing IME or Alt combinations',async()=>{
 const {historyShortcut}=await import('../lib/pptx/shortcuts.ts');
 const event={key:'z',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,isComposing:false};
 assert.equal(historyShortcut({...event,metaKey:true}),'undo');
 assert.equal(historyShortcut({...event,ctrlKey:true}),'undo');
 assert.equal(historyShortcut({...event,metaKey:true,shiftKey:true,key:'Z'}),'redo');
 assert.equal(historyShortcut({...event,ctrlKey:true,shiftKey:true}),'redo');
 assert.equal(historyShortcut({...event,ctrlKey:true,key:'y'}),'redo');
 assert.equal(historyShortcut(event),null);
 assert.equal(historyShortcut({...event,metaKey:true,key:'y'}),null);
 assert.equal(historyShortcut({...event,ctrlKey:true,altKey:true}),null);
 assert.equal(historyShortcut({...event,metaKey:true,isComposing:true}),null);
});

test('vertical number scrubbing uses integer steps, increases upward, and clamps at zero',async()=>{
 const {scrubbedValue}=await import('../lib/pptx/number-scrub.ts');
 assert.equal(scrubbedValue(10,0),10);
 assert.equal(scrubbedValue(10,-6),11);
 assert.equal(scrubbedValue(10,6),9);
 assert.equal(scrubbedValue(10,-60),20);
 assert.equal(scrubbedValue(1,60),0);
 assert.equal(scrubbedValue(10,-2),10);
 assert.equal(scrubbedValue(Number.MAX_SAFE_INTEGER,-60),Number.MAX_SAFE_INTEGER);
});

test('semantic lists keep item identity and preview counts separate from export patches',async()=>{
 const {slideLists,listPreviewCount}=await import('../lib/pptx/lists.ts');
 const list=slideLists(slides[2].nodes,{})[0];
 assert.ok(list.grouped);assert.equal(list.dynamic,true);assert.equal(list.min,3);assert.equal(list.max,5);
 assert.equal(list.items.length,5);assert.ok(list.items.every(item=>item.nodes.includes(item.roots[0])));
 assert.equal(listPreviewCount(list,{[list.key]:1}),3);
 assert.equal(listPreviewCount(list,{[list.key]:99}),5);
 const patches={[list.controller.key]:{name:`@${list.index}@1`}};
 const fixed=slideLists(slides[2].nodes,patches)[0];
 assert.equal(fixed.dynamic,false);assert.equal(listPreviewCount(fixed,{[fixed.key]:1}),5);
 const bytes=await writePptx(original,patches);
 const reread=await readSourceSlides(bytes);
 assert.deepEqual(reread.map(s=>s.nodes.map(n=>n.id)),slides.map(s=>s.nodes.map(n=>n.id)));
});

test('list item headings replace root group rows and tolerate prefixed content names',async()=>{
 const {slideLists,listItemNodes,listNodeLabel}=await import('../lib/pptx/lists.ts');
 const list=slideLists(slides[2].nodes,{})[0],item=list.items[0],root=item.roots[0];
 assert.ok(!listItemNodes(item).some(n=>n.key===root.key));
 assert.equal(listItemNodes(item).length,item.nodes.length-1);
 assert.equal(listNodeLabel('@1@1 文本'),'文本');
 assert.equal(listNodeLabel('@1@2 @文本[2-8]'),'文本[2-8]');
 assert.equal(listNodeLabel(' @1@1[3-5] 文本 '),'文本');
 const child=item.nodes.find(n=>n.parentId===root.id);
 const patches={[child.key]:{name:'@1@1 文本'}};
 const compatible=slideLists(slides[2].nodes,patches)[0];
 assert.equal(compatible.grouped,true);
 assert.deepEqual(compatible.items[0].roots.map(n=>n.key),[root.key]);
 assert.ok(listItemNodes(compatible.items[0]).some(n=>n.key===child.key));
 const flat={...child,parentId:null};
 const flatList=slideLists([flat],{[flat.key]:{name:'@1@1 文本'}})[0];
 assert.equal(listItemNodes(flatList.items[0])[0].key,flat.key);
 assert.equal(child.name,item.nodes.find(n=>n.key===child.key).name);
});

test('flat list members become native groups and can be added or released without deleting shapes',async t=>{
 const {editListMembers,groupedModel}=await import('../lib/pptx/grouping.ts');
 const {slideLists}=await import('../lib/pptx/lists.ts');
 const renderNodes=(nodes,parent=null)=>nodes.filter(n=>n.parentId===parent).map(n=>({id:n.id,type:n.kind==='grpSp'?'group':'text',left:n.box?.x??0,top:n.box?.y??0,width:n.box?.width??1,height:n.box?.height??1,elements:n.kind==='grpSp'?renderNodes(nodes,n.id):undefined}));
 const model={bytes:original,slides,deck:{size:{width:960,height:540},themeColors:[],slides:slides.map(s=>({elements:renderNodes(s.nodes)}))},sha256:'test',mappingWarnings:[]};
 const list=slideLists(slides[3].nodes,{})[0],item=list.items[0];
 const decoration=slides[3].nodes.find(n=>!n.parentId&&n.box&&!n.dataKind&&!n.name.startsWith('@'));
 assert.ok(decoration);
 const result=editListMembers(model,3,list,item.index,[...item.roots.map(n=>n.key),decoration.key],{});
 const derived=groupedModel(model,result.patches),converted=slideLists(derived.slides[3].nodes,result.patches)[0];
 assert.equal(converted.grouped,true);assert.equal(converted.items.length,list.items.length);
 const bytes=await writePptx(original,result.patches),actual=await readSourceSlides(bytes);
 assert.equal(actual[3].nodes.filter(n=>n.kind==='grpSp').length,slides[3].nodes.filter(n=>n.kind==='grpSp').length+list.items.length);
 for(const n of slides[3].nodes){
  const next=actual[3].nodes.find(v=>v.id===n.id);assert.ok(next);assert.equal(next.text,n.text);
  const before=worldFrame(n,slides[3].nodes,{}),after=worldFrame(next,actual[3].nodes,{});
  before.forEach((value,i)=>assert.ok(Math.abs(value-after[i])<.0001));
 }
 assert.deepEqual(validateWorkspace([actual[3]],{}),[]);
 const released=editListMembers(derived,3,converted,1,item.roots.map(n=>n.key),result.patches);
 const reread=await readSourceSlides(await writePptx(original,released.patches));
 assert.equal(reread[3].nodes.find(n=>n.id===decoration.id).parentId,null);
 assert.equal(reread[3].nodes.length,actual[3].nodes.length);
 assert.equal(slides[3].nodes.find(n=>n.id===decoration.id).parentId,null);
 writeTestPptx(t,'slidelatch-native-groups.pptx',bytes);
});

test('editing an existing native group releases members in place and preserves untouched package parts',async()=>{
 const {editListMembers,groupedModel}=await import('../lib/pptx/grouping.ts');const {slideLists}=await import('../lib/pptx/lists.ts');
 const render=(nodes,parent=null)=>nodes.filter(n=>n.parentId===parent).map(n=>({id:n.id,type:n.kind==='grpSp'?'group':'text',left:n.box?.x??0,top:n.box?.y??0,width:n.box?.width??1,height:n.box?.height??1,elements:n.kind==='grpSp'?render(nodes,n.id):undefined}));
 const model={bytes:original,slides,deck:{size:{width:960,height:540},themeColors:[],slides:slides.map(s=>({elements:render(s.nodes)}))},sha256:'test',mappingWarnings:[]};
 const list=slideLists(slides[2].nodes,{})[0],root=list.controller,children=slides[2].nodes.filter(n=>n.parentId===root.id);
 const result=editListMembers(model,2,list,1,children.slice(1).map(n=>n.key),{});
 const derived=groupedModel(model,result.patches),bytes=await writePptx(original,result.patches),actual=await readSourceSlides(bytes);
 assert.equal(actual[2].nodes.length,slides[2].nodes.length);
 assert.equal(actual[2].nodes.find(n=>n.id===children[0].id).parentId,null);
 assert.equal(derived.slides[2].nodes.find(n=>n.id===children[0].id).parentId,null);
 for(const n of slides[2].nodes.filter(n=>n.kind!=='grpSp')){const next=actual[2].nodes.find(v=>v.id===n.id),a=worldFrame(n,slides[2].nodes,{}),b=worldFrame(next,actual[2].nodes,{});a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<.0001));}
 const beforeZip=await JSZip.loadAsync(original),afterZip=await JSZip.loadAsync(bytes);
 for(const name of Object.keys(beforeZip.files))if(!beforeZip.files[name].dir&&name!==slides[2].path)assert.deepEqual(await afterZip.file(name).async('uint8array'),await beforeZip.file(name).async('uint8array'));
 assert.throws(()=>editListMembers(model,2,list,1,[],{}),/GROUP_EMPTY/);
});
