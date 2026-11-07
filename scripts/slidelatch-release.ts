import { readFile, writeFile, mkdir, mkdtemp, copyFile, readdir, rmdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { compileTemplate, assertReviewMatchesManifest } from '../packages/ppt-dsl/src/index.js';
import { validateReleaseReview } from '../lib/workflow/release.ts';
// DOM adapters are local to this Node command; browser code uses native DOM APIs.
Object.assign(globalThis,{DOMParser,XMLSerializer});
const options:Record<string,string>={};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--template','--review','--out'].includes(key)||!process.argv[i+1]||options[key])throw new Error('Usage: template:release -- --template marked.pptx --review workflow-review.json --out new-directory');options[key]=process.argv[i+1];}
if(!options['--template']||!options['--review']||!options['--out'])throw new Error('Required: --template, --review, --out');
const template=path.resolve(options['--template']),out=path.resolve(options['--out']),parent=path.dirname(out);
if(await stat(out).then(()=>true,()=>false))throw new Error('RELEASE_OUTPUT_EXISTS: choose a new directory');
const bytes=await readFile(template),report=await validateReleaseReview(bytes,JSON.parse(await readFile(path.resolve(options['--review']),'utf8')));
await mkdir(parent,{recursive:true});const temporary=await mkdtemp(path.join(parent,'.slidelatch-release-'));
let reserved=false;const published:string[]=[];
try{
  // Pin the checked bytes so later source-file edits cannot race the compiler.
  const pinned=path.join(temporary,'reviewed.pptx');await writeFile(pinned,bytes);
  const manifest=await compileTemplate(pinned,temporary);
  assertReviewMatchesManifest(manifest,report.probes);
  manifest.sourceTemplate='template.pptx';
  await writeFile(path.join(temporary,'template-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await rm(pinned);
  await writeFile(path.join(temporary,'workflow-review.json'),JSON.stringify(report,null,2)+'\n');
  // Exclusive reservation and exclusive file copies prevent racing publishers from overwriting a directory or file.
  await mkdir(out);reserved=true;
  for(const name of await readdir(temporary)){const target=path.join(out,name);await copyFile(path.join(temporary,name),target,constants.COPYFILE_EXCL);published.push(target);}
  const marker=path.join(out,'workflow-release.json');
  await writeFile(marker,JSON.stringify({schemaVersion:1,product:'SlideLatch',complete:true,templateSha256:report.templateSha256},null,2)+'\n',{flag:'wx'});published.push(marker);
  await rm(temporary,{recursive:true,force:true});
  console.info(`[SlideLatch] compiled review bundle: ${out}`);
  console.info('[SlideLatch] SVG boundary samples checked. Native Office and complete visual fidelity remain unverified.');
}catch(error){
  for(const target of published)await rm(target,{force:true});
  if(reserved)await rmdir(out).catch(()=>{}); // Preserve any unrelated file added by another process.
  await rm(temporary,{recursive:true,force:true});throw error;
}
