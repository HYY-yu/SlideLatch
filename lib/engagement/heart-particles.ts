export type Point={x:number;y:number};
export type HeartParticle={
 size:number;color:string;duration:number;delay:number;
 path:{start:Point;control1:Point;control2:Point;end:Point};
 frames:{offset:number;opacity:number;transform:string}[];
};
/** Cubic Bézier motion: two independently randomized controls give each heart its own arc. */
export function bezierPoint(t:number,start:Point,control1:Point,control2:Point,end:Point):Point{
 const u=1-t;
 return {x:u**3*start.x+3*u*u*t*control1.x+3*u*t*t*control2.x+t**3*end.x,y:u**3*start.y+3*u*u*t*control1.y+3*u*t*t*control2.y+t**3*end.y};
}
export function createHeartParticles(random:()=>number=Math.random):HeartParticle[]{
 const between=(min:number,max:number)=>min+(max-min)*random();
 const colors=['#f879a3','#b799ff','#ffb0ce'];
 const count=5+Math.floor(random()*3);
 return Array.from({length:count},(_,i)=>{
  // Alternate sides for a balanced burst, with randomized distance, curvature and timing.
  const start={x:between(-4,4),y:between(-3,3)};
  const end={x:(i%2?-1:1)*between(24,110),y:-between(105,185)};
  const control1={x:between(-36,36),y:-between(20,50)};
  const control2={x:end.x+between(-55,55),y:Math.min(control1.y-15,end.y*between(.6,.86))};
  const startTurn=between(-20,20),endTurn=between(-65,65),endScale=between(.75,1.2);
  const frames=Array.from({length:31},(_,frame)=>{
   const t=frame/30,p=bezierPoint(t,start,control1,control2,end);
   const opacity=Math.min(1,t/.12)*Math.min(1,(1-t)/.4);
   const scale=.3+(.7*Math.min(1,t/.2))+(endScale-1)*t;
   return {offset:t,opacity,transform:`translate(-50%, -50%) translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${(startTurn+(endTurn-startTurn)*t).toFixed(2)}deg) scale(${scale.toFixed(3)})`};
  });
  return {size:between(14,28),color:colors[Math.floor(random()*colors.length)],duration:between(900,1500),delay:between(0,100),path:{start,control1,control2,end},frames};
 });
}
