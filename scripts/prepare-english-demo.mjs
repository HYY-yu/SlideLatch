/** Produce the English sibling of Minimal Business without changing DSL identities or geometry. */
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.argv[process.argv.indexOf('--runtime')+1];
if(!process.argv.includes('--runtime'))throw new Error('Pass --runtime /path/to/ppt-node-dsl-project');
const temp=await mkdtemp(path.join(tmpdir(),'slidelatch-english-'));
const cli=(name,args)=>execFileSync(process.execPath,['--import',path.join(runtime,'node_modules/tsx/dist/loader.mjs'),path.join(runtime,`src/${name}.ts`),...args],{stdio:'inherit',cwd:temp});
const source=path.join(root,'public/demo/minimal-business/minimal-business-original.pptx'),bytes=await readFile(source);
const sourceHash=createHash('sha256').update(bytes).digest('hex');
cli('compile-template',['--template',source,'--out',path.join(temp,'base')]);
const manifest=JSON.parse(await readFile(path.join(temp,'base/template-manifest.json'),'utf8'));
const contracts=new Map();
for(const slide of manifest.slides){for(const node of [...slide.nodes,...slide.lists.flatMap(l=>l.items.flatMap(i=>i.components))])if(node.kind==='text')contracts.set(`${slide.slidePath}#${node.locator.shapeId}`,node.length);}
const mappingFile=path.join(root,'docs/examples/english-template-map.json');let previous={nodes:{}};
try{previous=JSON.parse(await readFile(mappingFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const mapping={sourceSha256:sourceHash,locale:'en',nodes:{},supplemental:{}};
const hasHan=text=>/\p{Script=Han}/u.test(text);
const a='http://schemas.openxmlformats.org/drawingml/2006/main',p='http://schemas.openxmlformats.org/presentationml/2006/main';
const elements=node=>Array.from(node.childNodes??[]).filter(n=>n.nodeType===1);
const child=(node,name)=>elements(node).find(n=>n.localName===name);
function chooseEnglish(sourceText,range){
 const special={'目录':'Contents','小标题小标题':'Subtitle','核心表述':'Main point','结果':'Result','坚持':'Focus','更好':'Better','提升':'Grow','基础':'Base'};
 const titles=['Section heading','Section title','Heading','Title','Text','ID'];
 const bodies=['Describe the main point and what it means for your audience.','Explain the point and its value to your audience.','Describe this point and the next action.','Add key details and context here.','Explain the key point.','Add details here.','Add details.','Body text','Content','Text','ID'];
 const candidates=[special[sourceText],...(sourceText.includes('标题')?titles:bodies)].filter(Boolean);
 const value=candidates.find(text=>!range||(text.length>=range.min&&text.length<=range.max));
 if(!value)throw new Error(`ENGLISH_CONTRACT_UNSUPPORTED: ${sourceText} ${JSON.stringify(range)}`);
 return value;
}
function supplemental(text,context){
 if(!hasHan(text))return text;
 const known={'结果':'Result','坚持':'Focus','更好':'Better','提升':'Grow','基础':'Base','目录':'Contents'};
 const value=known[text]??(text.includes('标题')?'Header':context==='chart'&&text.includes('标签')?`Item ${text.replace(/\D/g,'')}`:context==='chart'?`Series ${text.replace(/\D/g,'')||'1'}`:'Value');
 mapping.supplemental[`${context}:${text}`]=value;return value;
}
const zip=await JSZip.loadAsync(bytes);
const coverOverrides={'2':'Heading','3':'Title','1003':'Subtitle','5':'Add a short summary of the presentation.','6':'Team name','7':'Date'};
for(const file of Object.keys(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f))){
 const doc=new DOMParser().parseFromString(await zip.file(file).async('string'),'application/xml');let changed=false;
 for(const shape of Array.from(doc.getElementsByTagNameNS(p,'sp'))){
  const props=child(child(shape,'nvSpPr')??shape,'cNvPr'),body=child(shape,'txBody');if(!props||!body)continue;
  const textNodes=Array.from(body.getElementsByTagNameNS(a,'t')),sourceText=textNodes.map(n=>n.textContent??'').join('');if(!hasHan(sourceText))continue;
  const key=`${file}#${props.getAttribute('id')}`,range=contracts.get(key);
  const old=previous.nodes[key];
  const english=old?.sourceText===sourceText?old.english:file==='ppt/slides/slide1.xml'&&coverOverrides[props.getAttribute('id')]?coverOverrides[props.getAttribute('id')]:chooseEnglish(sourceText,range);
  if(hasHan(english)||range&&(english.length<range.min||english.length>range.max))throw new Error(`ENGLISH_TEXT_RANGE: ${key}`);
  mapping.nodes[key]={sourceText,english,name:props.getAttribute('name'),...(range?{range}:{})};
  // Keep all existing runs/paragraph properties. No xml:space attribute is needed for these trimmed strings.
  textNodes.forEach((node,index)=>{node.textContent=index===0?english:'';});changed=true;
 }
 for(const node of Array.from(doc.getElementsByTagNameNS(a,'t')))if(hasHan(node.textContent??'')){node.textContent=supplemental(node.textContent,'table');changed=true;}
 if(changed)zip.file(file,new XMLSerializer().serializeToString(doc),{createFolders:false});
}
for(const file of Object.keys(zip.files).filter(f=>/^ppt\/charts\/chart[^/]*\.xml$/.test(f))){
 const doc=new DOMParser().parseFromString(await zip.file(file).async('string'),'application/xml');let changed=false;
 for(const node of Array.from(doc.getElementsByTagName('*')))if(['v','t'].includes(node.localName)&&hasHan(node.textContent??'')){node.textContent=supplemental(node.textContent,'chart');changed=true;}
 if(changed)zip.file(file,new XMLSerializer().serializeToString(doc),{createFolders:false});
}
for(const file of Object.keys(zip.files).filter(f=>f.startsWith('ppt/embeddings/')&&f.endsWith('.xlsx'))){
 const workbook=await JSZip.loadAsync(await zip.file(file).async('uint8array'));let changed=false;
 for(const part of Object.keys(workbook.files).filter(f=>f.endsWith('.xml'))){
  const doc=new DOMParser().parseFromString(await workbook.file(part).async('string'),'application/xml');let partChanged=false;
  for(const node of Array.from(doc.getElementsByTagName('*')))if(['t','v'].includes(node.localName)&&hasHan(node.textContent??'')){node.textContent=supplemental(node.textContent,'chart');partChanged=true;}
  if(partChanged){workbook.file(part,new XMLSerializer().serializeToString(doc),{createFolders:false});changed=true;}
 }
 if(changed)zip.file(file,await workbook.generateAsync({type:'uint8array',compression:'DEFLATE'}),{createFolders:false});
}
const directory=path.join(root,'public/demo/minimal-business/en');await mkdir(directory,{recursive:true});
const englishBytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),output=path.join(directory,'minimal-business-original.pptx');await writeFile(output,englishBytes);
const metadata=JSON.parse(await readFile(path.join(root,'lib/demo/template.json'),'utf8'));
metadata.id+='-en';metadata.locale='en';metadata.downloadUrl='/demo/minimal-business/en/minimal-business-original.pptx';metadata.overview='/demo/minimal-business/en/cover.png';metadata.sha256=createHash('sha256').update(englishBytes).digest('hex');
for(const field of metadata.fields)field.sample=mapping.nodes[`ppt/slides/slide1.xml#${field.shapeId}`]?.english??field.sample;
await writeFile(path.join(root,'lib/demo/template.en.json'),JSON.stringify(metadata,null,2)+'\n');
await writeFile(mappingFile,JSON.stringify(mapping,null,2)+'\n');
cli('compile-template',['--template',output,'--out',path.join(temp,'english')]);
console.info('[english-template] complete',{translatedNodes:Object.keys(mapping.nodes).length,sourceSha256:sourceHash,output,temp});
