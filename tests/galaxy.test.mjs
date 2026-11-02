import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the renderer lifecycle against a GPU contract, without requiring a real GPU in CI.
function renderer({reduced=false, supported=true}={}) {
 const effects=[],frames=new Map(),allocations=[],deleted=[],listeners=new Map();
 let frameId=0,textureId=0,losses=0;
 const gl=new Proxy({
  createShader:()=>({}),getShaderParameter:()=>true,createProgram:()=>({}),
  getProgramParameter:(_p,key)=>key==='LINK_STATUS',
  getExtension:name=>name==='WEBGL_lose_context'?{loseContext:()=>losses++}:null,
  createTexture:()=>({id:++textureId}),deleteTexture:t=>deleted.push(t),
  texStorage2D:(...args)=>allocations.push(args),
 },{get:(target,key)=>key in target?target[key]:/^[A-Z0-9_]+$/.test(key)?key:()=>{}});
 const container={clientWidth:1200,clientHeight:570,getBoundingClientRect:()=>({left:0,top:0,width:1200,height:570})};
 const canvas={getContext:()=>supported?gl:null,style:{},addEventListener:()=>{},removeEventListener:()=>{}};
 const refs=[{current:container},{current:canvas},{current:null}];
 let refIndex=0,resize,preference;
 const media={matches:reduced,addEventListener:(_e,fn)=>{preference=fn},removeEventListener:()=>{}};
 const react={useRef:value=>refs[refIndex++]??{current:value},useEffect:fn=>effects.push(fn)};
 const exports={};
 const code=ts.transpileModule(readFileSync(new URL('../components/galaxy.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{
  exports,require:name=>name==='react'?react:{jsx:()=>null,jsxs:()=>null},
  window:{devicePixelRatio:1,matchMedia:()=>media,addEventListener:(e,fn)=>listeners.set(e,fn),removeEventListener:e=>listeners.delete(e)},
  document:{hidden:false,createElement:()=>({getContext:()=>null}),documentElement:{addEventListener:()=>{},removeEventListener:()=>{}},addEventListener:()=>{},removeEventListener:()=>{}},
  ResizeObserver:class{constructor(fn){resize=fn}observe(){}disconnect(){}},
  IntersectionObserver:class{observe(){}disconnect(){}},
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id),
  console:{warn:()=>{}},Float32Array,Math,Map,Event,
 });
 exports.default({intro:false,lightMode:true,transparent:false,backgroundColor:"#ffffff",starColors:["#7651c9"],clickWarp:false});
 return {effects,frames,allocations,deleted,canvas,container,media,listeners,resize:()=>resize(),changeMotion:()=>preference(),losses:()=>losses,
  tick:()=>{const [id,fn]=frames.entries().next().value??[];if(fn){frames.delete(id);fn(16)}}};
}

test('effect replay releases resources without permanently losing the reused canvas context',()=>{
 const r=renderer(),cleanup=r.effects[0]();
 assert.equal(r.canvas.width,1200);cleanup();
 assert.equal(r.frames.size,0);assert.equal(r.listeners.size,0);assert.equal(r.losses(),0);
 const cleanupAgain=r.effects[0]();assert.equal(r.frames.size,1);cleanupAgain();
});
test('viewport resize tracks the display size with a bounded pixel ratio',()=>{
 const r=renderer(),cleanup=r.effects[0]();
 assert.equal(r.canvas.width,1200);r.container.clientWidth=390;r.resize();
 assert.equal(r.canvas.width,390);assert.equal(r.canvas.height,570);cleanup();
});
test('reduced motion renders once, supports live preference changes, and unsupported WebGL schedules nothing',()=>{
 const r=renderer({reduced:true}),cleanup=r.effects[0]();r.tick();assert.equal(r.frames.size,0);
 r.media.matches=false;r.changeMotion();r.tick();assert.equal(r.frames.size,1);
 r.media.matches=true;r.changeMotion();r.tick();assert.equal(r.frames.size,0);cleanup();
 const unavailable=renderer({supported:false});assert.equal(unavailable.effects[0](),undefined);assert.equal(unavailable.frames.size,0);
});
