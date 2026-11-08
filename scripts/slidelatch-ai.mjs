/** User-operated handoff. Prepare/apply are offline. Only codex --confirm-chatgpt-use invokes a model. */
import { readFile, writeFile, mkdir, mkdtemp, rm, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { readSourceSlides, writePptx } from '../lib/pptx/xml.ts';
import { inspectWorkspace, applyMarkProposal, sha256Bytes, createBoundaryProbes } from '../lib/workflow/session.ts';
import { buildRecognitionRequest } from '../lib/workflow/recognition.ts';
Object.assign(globalThis, { DOMParser, XMLSerializer });
const limits = { file: 50 * 1024 * 1024, expanded: 200 * 1024 * 1024, json: 20 * 1024 * 1024 };
const warning = 'Source-only AI handoff: no SVG rendering, visual review, native Office validation or release approval. Model output is an untrusted proposal, not a verified template.';
async function boundedRead(file, limit) {
  const info = await stat(file);
  if (!info.isFile() || info.size > limit) throw new Error('AI_FILE_SIZE_LIMIT');
  const bytes = await readFile(file);
  if (bytes.length > limit) throw new Error('AI_FILE_SIZE_LIMIT');
  return bytes;
}
async function sourceModel(bytes) {
  if (!bytes.length || bytes.length > limits.file) throw new Error('PPTX_SIZE_LIMIT');
  const zip = await JSZip.loadAsync(bytes), entries = Object.values(zip.files);
  if (entries.length > 5000) throw new Error('PPTX_ENTRY_LIMIT');
  let expanded = 0;
  for (const entry of entries) {
    const size = entry._data?.uncompressedSize ?? 0;
    if (!Number.isSafeInteger(size) || size < 0 || (expanded += size) > limits.expanded) throw new Error('PPTX_EXPANSION_LIMIT');
  }
  const slides = await readSourceSlides(bytes);
  if (!slides.length || slides.length > 200) throw new Error('PPTX_SLIDE_LIMIT');
  // Do not fabricate renderer mappings. Page contracts are available; arbitrary speaker notes are omitted.
  return { bytes: Uint8Array.from(bytes).buffer, sha256: await sha256Bytes(bytes), slides,
    deck: { slides: slides.map(slide => ({ note: slide.pageContract ? [slide.pageContract.pageType, ...slide.pageContract.logic].join('\n') : '', elements: [] })), size: {width:0,height:0}, themeColors: [] }, mappingWarnings: [] };
}
async function sourceSnapshot(model) {
  const snapshot = await inspectWorkspace(model, {});
  snapshot.mappingWarnings.push('CLI_SOURCE_ONLY_NOT_RENDERED');
  snapshot.limitations.push(warning, 'Arbitrary speaker notes are omitted; note contains only a parsed page contract when available.');
  return snapshot;
}
async function newDirectory(out, work) {
  await mkdir(path.dirname(out), {recursive:true});
  await mkdir(out); // Exclusive directory reservation, never reuse or overwrite user files.
  const owned = [];
  const write = async (name, data) => { const file=path.join(out,name); await writeFile(file,data,{flag:'wx'}); owned.push(file); };
  try { return await work(write); } catch (error) {
    for (const file of owned) await rm(file,{force:true});
    await import('node:fs/promises').then(fs=>fs.rmdir(out)).catch(()=>{});
    throw error;
  }
}
function json(value) { return JSON.stringify(value,null,2)+'\n'; }
function modelPrompt(request, schema) {
  return `${request.instructions}\n\nYou are doing semantic interpretation of the supplied slide content, not running structural heuristics. Infer editable intent and page roles only when supported by the text and geometry. Preserve uncertain decoration/branding. All ranges remain provisional. Return both marks and pages arrays; if no safe change exists return both empty. Do not use tools, read other files, access network or modify anything. Do not claim you reviewed screenshots or visual bounds.\n\n${json({documentData:request.documentData,responseSchema:schema})}`;
}
export async function prepareHandoff(template, out) {
  const bytes = await boundedRead(template,limits.file), model = await sourceModel(bytes), snapshot = await sourceSnapshot(model);
  const request = buildRecognitionRequest(snapshot);
  // Codex structured-output schemas require every declared property. Empty arrays mean no safe changes;
  // the application validator still requires at least one actual change and refuses no-op proposals.
  const schema = structuredClone(request.responseSchema);
  delete schema.anyOf; schema.required = Object.keys(schema.properties);
  const prompt = modelPrompt(request, schema);
  if (Buffer.byteLength(prompt)>limits.json) throw new Error('AI_PROMPT_SIZE_LIMIT');
  await newDirectory(out, async write => {
    await write('source.pptx',bytes); await write('workspace-inspection.json',json(snapshot));
    await write('recognition-request.json',json(request)); await write('response.schema.json',json(schema));
    await write('prompt.txt',prompt); await write('handoff.json',json({schemaVersion:1,product:'SlideLatch',templateSha256:model.sha256,snapshotId:snapshot.snapshotId,mode:'source-only',modelInvoked:false,visualGuarantee:false,warning}));
  });
  return {out,templateSha256:model.sha256,snapshotId:snapshot.snapshotId,modelInvoked:false,warning};
}
async function loadHandoff(bundle) {
  const metadata = JSON.parse((await boundedRead(path.join(bundle,'handoff.json'),limits.json)).toString());
  const bytes = await boundedRead(path.join(bundle,'source.pptx'),limits.file), model = await sourceModel(bytes), snapshot=await sourceSnapshot(model);
  if (metadata.schemaVersion!==1 || metadata.product!=='SlideLatch' || metadata.templateSha256!==model.sha256 || metadata.snapshotId!==snapshot.snapshotId) throw new Error('AI_HANDOFF_STALE');
  return {bytes,model,snapshot};
}
export async function applyHandoff(bundle, proposalFile, out) {
  const {bytes,model,snapshot}=await loadHandoff(bundle);
  const proposal=JSON.parse((await boundedRead(proposalFile,1_000_000)).toString());
  const patches=await applyMarkProposal(model,{},snapshot,proposal);
  const marked=await writePptx(bytes,patches), nextModel=await sourceModel(new Uint8Array(marked)), next=await sourceSnapshot(nextModel);
  await newDirectory(out,async write=>{
    await write('marked.pptx',new Uint8Array(marked)); await write('mark-proposal.json',json(proposal));
    await write('workspace-inspection.json',json(next)); await write('boundary-probes.json',json(createBoundaryProbes(nextModel,{},next.snapshotId)));
    await write('handoff-result.json',json({schemaVersion:1,sourceTemplateSha256:model.sha256,templateSha256:nextModel.sha256,status:'needs_review',visualGuarantee:false,nativeOfficeValidation:'not_run',warning}));
  });
  return {out,status:'needs_review',warning};
}
async function findCodex(explicit) {
  if (explicit) { await access(explicit,constants.X_OK); return path.resolve(explicit); }
  const candidates=[...String(process.env.PATH??'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,'codex')),
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
    '/Volumes/GW/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'];
  for (const file of candidates) try { await access(file,constants.X_OK); return file; } catch {}
  throw new Error('CODEX_NOT_FOUND: pass --codex /absolute/path/to/existing/codex; this command never installs it.');
}
function codexEnvironment() {
  const env={...process.env};
  // Force the existing ChatGPT route, not a separately billed API credential or endpoint.
  for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','OPENAI_API_BASE','AZURE_OPENAI_API_KEY','AZURE_OPENAI_ENDPOINT']) delete env[key];
  return env;
}
export async function codexHandoff(bundle,out,{confirmed=false,dryRun=false,binary}={}) {
  const {snapshot}=await loadHandoff(bundle);
  const executable=await findCodex(binary), env=codexEnvironment();
  const version=spawnSync(executable,['--version'],{encoding:'utf8',env,timeout:10000});
  const login=spawnSync(executable,['login','status'],{encoding:'utf8',env,timeout:10000});
  if(version.status!==0)throw new Error('CODEX_VERSION_CHECK_FAILED');
  if(login.status!==0 || !`${login.stdout}\n${login.stderr}`.includes('Logged in using ChatGPT')) throw new Error('CODEX_CHATGPT_LOGIN_REQUIRED: sign in yourself using the existing app; SlideLatch does not collect or save credentials.');
  const notice='This sends the prepared document inspection to OpenAI through your existing ChatGPT/Codex account and uses its allowance or credits. It is not guaranteed free. No API key is used. Continue only if you authorize this document and usage.';
  if (dryRun) return {version:version.stdout.trim(),login:'ChatGPT',modelInvoked:false,notice,sourceTemplateSha256:snapshot.templateSha256};
  if (!confirmed) throw new Error(`AI_CONFIRMATION_REQUIRED: ${notice} Rerun yourself with --confirm-chatgpt-use after reviewing prompt.txt.`);
  if(await stat(out).then(()=>true,()=>false))throw new Error('AI_OUTPUT_EXISTS');
  const temporary=await mkdtemp(path.join(os.tmpdir(),'slidelatch-codex-'));
  try{
    // Rebuild the prompt from pinned bytes instead of executing a hand-edited prompt from the bundle.
    const request=buildRecognitionRequest(snapshot), schema=structuredClone(request.responseSchema);
    delete schema.anyOf;schema.required=Object.keys(schema.properties);
    const schemaPath=path.join(temporary,'response.schema.json'),responsePath=path.join(temporary,'proposal.json');
    await writeFile(schemaPath,json(schema));
    const prompt=modelPrompt(request,schema);
    const args=['exec','--ignore-user-config','--ephemeral','--sandbox','read-only','--skip-git-repo-check','--cd',temporary,'--output-schema',schemaPath,'--output-last-message',responsePath,'-'];
    const child=spawn(executable,args,{env,stdio:['pipe','inherit','inherit']});child.stdin.end(prompt);
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});
    if(code!==0)throw new Error(`CODEX_EXEC_FAILED: ${code}`);
    const proposal=JSON.parse((await boundedRead(responsePath,1_000_000)).toString());
    const noChanges=proposal && typeof proposal==='object' && !Array.isArray(proposal)
      && Object.keys(proposal).every(key=>['schemaVersion','templateSha256','snapshotId','marks','pages'].includes(key))
      && proposal.schemaVersion===1 && proposal.templateSha256===snapshot.templateSha256 && proposal.snapshotId===snapshot.snapshotId
      && Array.isArray(proposal.marks) && proposal.marks.length===0 && Array.isArray(proposal.pages) && proposal.pages.length===0;
    const {model}=await loadHandoff(bundle);
    if(!noChanges)await applyMarkProposal(model,{},snapshot,proposal);
    await mkdir(path.dirname(out),{recursive:true});await writeFile(out,json(proposal),{flag:'wx'});
    return {out,status:noChanges?'no_safe_changes':'proposal_ready',modelInvoked:true,applied:false,visualGuarantee:false,notice};
  }finally{await rm(temporary,{recursive:true,force:true});}
}
async function main() {
  const [command,...args]=process.argv.slice(2), options={};
  for(let i=0;i<args.length;i++){
    const key=args[i]; if(!['--template','--bundle','--proposal','--out','--codex','--dry-run','--confirm-chatgpt-use'].includes(key)||key in options)throw new Error('AI_USAGE: invalid or duplicate argument');
    options[key]=['--dry-run','--confirm-chatgpt-use'].includes(key)?true:args[++i];if(!options[key]||String(options[key]).startsWith('--'))throw new Error('AI_USAGE: missing value');
  }
  const required=command==='prepare'?['--template','--out']:command==='apply'?['--bundle','--proposal','--out']:command==='codex'?['--bundle','--out']:null;
  if(!required||required.some(key=>!options[key]))throw new Error('AI_USAGE: prepare --template input.pptx --out new-bundle | apply --bundle bundle --proposal proposal.json --out new-result | codex --bundle bundle --out proposal.json [--dry-run | --confirm-chatgpt-use]');
  const absolute=key=>path.resolve(String(options[key]));
  const result=command==='prepare'?await prepareHandoff(absolute('--template'),absolute('--out')):command==='apply'?await applyHandoff(absolute('--bundle'),absolute('--proposal'),absolute('--out')):await codexHandoff(absolute('--bundle'),absolute('--out'),{dryRun:options['--dry-run']===true,confirmed:options['--confirm-chatgpt-use']===true,binary:options['--codex']?absolute('--codex'):undefined});
  console.info(json(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
