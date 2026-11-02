/** Rebuild real, static PPTX comparisons. Requires the existing PPT DSL runtime, LibreOffice and Poppler. */
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir,platform} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.argv[process.argv.indexOf('--runtime')+1];
if(!process.argv.includes('--runtime')||!runtime)throw new Error('Pass --runtime /path/to/ppt-node-dsl-project');
const locale=process.argv.includes('--locale')?process.argv[process.argv.indexOf('--locale')+1]:'zh';
if(!['zh','en'].includes(locale))throw new Error('Invalid locale');
const suffix=locale==='en'?'.en':'';
const temp=await mkdtemp(path.join(tmpdir(),'slidelatch-showcase-'));
const out=path.join(root,'public/demo/showcase',locale==='en'?'en':'');await mkdir(out,{recursive:true});
const template=path.join(root,'public/demo/minimal-business',locale==='en'?'en':'','minimal-business-original.pptx');
const content=JSON.parse(await readFile(path.join(root,`docs/examples/showcase/content${suffix}.json`),'utf8'));
const cli=(name,args)=>execFileSync(process.execPath,['--import',path.join(runtime,'node_modules/tsx/dist/loader.mjs'),path.join(runtime,`src/${name}.ts`),...args],{stdio:'inherit',cwd:temp});
const compiled=path.join(temp,'compiled');cli('compile-template',['--template',template,'--out',compiled]);
const manifest=path.join(compiled,'template-manifest.json');
const zip=await JSZip.loadAsync(await readFile(template));
for(const i of [2,3])await writeFile(path.join(temp,`image${i}.jpeg`),await zip.file(`ppt/media/image${i}.jpeg`).async('uint8array'));
const texts=(values)=>Object.fromEntries(values.map((v,i)=>[`text_${i+1}`,v]));
function slide(templateId,values,extra={}){return {templateId,nodes:{...texts(values),...extra},sourceRefs:['fictional-showcase']};}
// LibreOffice's isolated runtime does not discover macOS CJK fonts by default.
const renderEnv={...process.env};
if(platform()==='darwin'&&!renderEnv.FONTCONFIG_FILE){
 const config=path.join(temp,'fonts.conf');
 const aliases=['Microsoft YaHei','微软雅黑','等线','PingFang SC','Alibaba PuHuiTi','sans-serif'].map(f=>`<alias><family>${f}</family><prefer><family>Heiti SC</family></prefer></alias>`).join('');
 await writeFile(config,`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/System/Library/Fonts</dir><dir>/System/Library/Fonts/Supplemental</dir><dir>/Library/Fonts</dir><cachedir>${temp}/font-cache</cachedir>${aliases}</fontconfig>`);
 await mkdir(path.join(temp,'font-cache'));renderEnv.FONTCONFIG_FILE=config;
}
const inputDirectory=path.join(root,'docs/examples/showcase',locale==='en'?'en':'');await mkdir(inputDirectory,{recursive:true});
const directoryCopy=locale==='en'?['Contents','Three chapters. Fictional content and data.']:['内容导航','围绕三个章节展开，所有案例内容与经营数据均为演示虚构。'];
const transitionCopy=locale==='en'?['Build repeatable methods around clear goals and practical actions.','Use shared goals and clear handoffs to help teams work together.','Use clear measures to guide the next round of team decisions.']:['从目标与关键动作出发，形成可以持续复用的工作方法。','用真实的任务场景组织团队行动，让协作目标保持一致。','用清晰的数据表达变化，为下一阶段行动提供讨论依据。'];
const versions=[];
for(const c of content.cases){
 const photo={path:path.join(temp,`image${c.photo}.jpeg`)};
 const input={title:c.title,slides:[
   slide('slide_001',c.cover,{image_1:photo}),
   {...slide('slide_003',directoryCopy),lists:{list_1:c.chapters.map(text_1=>({text_1}))}},
   slide('slide_005',[c.chapters[0],transitionCopy[0]]),
   slide('slide_008',c.text),
   {...slide('slide_030',[c.listTitle,c.listSummary]),lists:{list_1:c.items.map(([text_1,text_2])=>({text_1,text_2}))}},
   slide('slide_005',[c.chapters[1],transitionCopy[1]]),
   slide('slide_026',c.image,{image_1:photo}),
   slide('slide_005',[c.chapters[2],transitionCopy[2]]),
   slide('slide_022',c.chartText,{chart_1:c.chart}),
   slide('slide_032',c.closing)
 ]};
 const inputPath=path.join(temp,`${c.id}.input.json`);await writeFile(inputPath,JSON.stringify(input,null,2));
 cli('validate-input',['--manifest',manifest,'--input',inputPath]);
 const pptx=path.join(out,`${c.id}.pptx`);
 cli('generate-deck',['--template',template,'--manifest',manifest,'--input',inputPath,'--out',pptx]);
 cli('verify-deck',['--pptx',pptx]);
 const portable=JSON.stringify(input,null,2).replaceAll(temp,'TEMPLATE_ASSETS');
 await writeFile(path.join(inputDirectory,`${c.id}.input.json`),portable+'\n');
 versions.push({id:c.id,title:c.title,slideCount:input.slides.length,listCount:c.items.length,sha256:createHash('sha256').update(await readFile(pptx)).digest('hex')});
}
const categories=[{id:'text',sourcePage:1,outputPage:1},{id:'list',sourcePage:30,outputPage:5},{id:'image',sourcePage:26,outputPage:7},{id:'chart',sourcePage:22,outputPage:9}];
for(const id of ['original',...versions.map(v=>v.id)]){
 const pptx=id==='original'?template:path.join(out,`${id}.pptx`),pdfDir=path.join(temp,id);await mkdir(pdfDir);
 execFileSync('soffice',[`-env:UserInstallation=file://${temp}/lo-profile`,'--headless','--convert-to','pdf','--outdir',pdfDir,pptx],{stdio:'inherit',timeout:120000,env:renderEnv});
 const pdf=path.join(pdfDir,path.basename(pptx,'.pptx')+'.pdf');
 if(id==='original'&&locale==='en')execFileSync('python3',[path.join(root,'scripts/render-template-overview.py'),'--pdf',pdf,'--out',path.join(root,'public/demo/minimal-business/en/cover.png')],{stdio:'inherit',env:renderEnv});
 for(const category of categories){const page=String(id==='original'?category.sourcePage:category.outputPage);
  execFileSync('pdftoppm',['-f',page,'-l',page,'-singlefile','-scale-to','1600','-jpeg','-jpegopt','quality=90',pdf,path.join(out,`${id}-${category.id}`)],{stdio:'inherit'});
 }
}
await writeFile(path.join(root,`lib/demo/showcase${suffix}.json`),JSON.stringify({templateSha256:createHash('sha256').update(await readFile(template)).digest('hex'),disclosure:content.disclosure,versions,categories},null,2)+'\n');
console.info('[showcase] complete',{out,versions:versions.length,temp});
