import test from 'node:test';
import assert from 'node:assert/strict';
import {bezierPoint,createHeartParticles} from '../lib/engagement/heart-particles.ts';
function random(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
test('cubic Bézier interpolation preserves endpoints and curved midpoints',()=>{
 const start={x:0,y:0},c1={x:80,y:-20},c2={x:-50,y:-80},end={x:20,y:-120};
 assert.deepEqual(bezierPoint(0,start,c1,c2,end),start);
 assert.deepEqual(bezierPoint(1,start,c1,c2,end),end);
 assert.deepEqual(bezierPoint(.5,start,c1,c2,end),{x:13.75,y:-52.5});
});
test('random bursts vary their curves and timings while remaining bounded and fading out',()=>{
 const rng=random(42),paths=new Set(),durations=new Set(),counts=new Set();
 for(let burst=0;burst<100;burst++){
  const particles=createHeartParticles(rng);assert.ok(particles.length>=5&&particles.length<=7);counts.add(particles.length);
  for(const p of particles){
   assert.ok(p.size>=14&&p.size<=28);assert.ok(p.duration>=900&&p.duration<=1500);assert.ok(p.delay>=0&&p.delay<=100);
   assert.ok(Math.abs(p.path.end.x)<=110);assert.ok(p.path.end.y<=-105&&p.path.end.y>=-185);
   let lastY=p.path.start.y;
   for(let i=1;i<=30;i++){const point=bezierPoint(i/30,p.path.start,p.path.control1,p.path.control2,p.path.end);assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));assert.ok(point.y<lastY);lastY=point.y;}
   assert.equal(p.frames[0].opacity,0);assert.equal(p.frames.at(-1).opacity,0);assert.equal(p.frames.at(-1).offset,1);
   assert.ok(p.frames.every(frame=>frame.opacity>=0&&frame.opacity<=1&&!/NaN|Infinity/.test(frame.transform)));
   paths.add(JSON.stringify(p.path));durations.add(p.duration);
  }
 }
 assert.ok(paths.size>400);assert.ok(durations.size>400);assert.equal(counts.size,3);
});
