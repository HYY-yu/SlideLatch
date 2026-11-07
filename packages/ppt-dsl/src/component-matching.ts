/** Browser/runtime share the exact same bounded contract matching, never XML-order inheritance. */
export const MAX_MATCH_COMPONENTS=8;
type MatchComponent={sampleContent:string;length?:{min:number;max:number};imageIndex?:number;locator:{box?:{cx:number;cy:number}}};
export function bestComponentAssignment<T extends MatchComponent>(contract:MatchComponent[],candidates:T[]):{assignment:T[];ambiguous:boolean}{
  if(contract.length!==candidates.length)throw new Error('COMPONENT_MATCH_COUNT');
  if(candidates.length>MAX_MATCH_COMPONENTS)throw new Error(`COMPONENT_MATCH_LIMIT: at most ${MAX_MATCH_COMPONENTS} same-kind components per list item`);
  const cost=contract.map(source=>candidates.map(candidate=>{
    let score=0;
    if(source.length){const length=Array.from(candidate.sampleContent.replace(/\s/g,'')).length;if(length<source.length.min||length>source.length.max)score+=1000;}
    const a=source.locator.box,b=candidate.locator.box;
    if(a&&b){score+=Math.abs(Math.log(Math.max(b.cx,1)/Math.max(a.cx,1)));score+=Math.abs(Math.log(Math.max(b.cy,1)/Math.max(a.cy,1)));}
    if(source.imageIndex!==undefined&&candidate.imageIndex!==undefined&&source.imageIndex!==candidate.imageIndex)score+=100;
    return score;
  }));
  let best=[...candidates],bestScore=Infinity,bestCount=0;
  const used=new Set<number>(),order:number[]=[];
  function visit(depth:number,score:number){
    if(depth===candidates.length){if(score<bestScore-1e-9){best=order.map(i=>candidates[i]);bestScore=score;bestCount=1;}else if(Math.abs(score-bestScore)<=1e-9)bestCount++;return;}
    for(let i=0;i<candidates.length;i++)if(!used.has(i)){used.add(i);order.push(i);visit(depth+1,score+cost[depth][i]);order.pop();used.delete(i);}
  }
  visit(0,0);return {assignment:best,ambiguous:candidates.length>1&&bestCount>1};
}
