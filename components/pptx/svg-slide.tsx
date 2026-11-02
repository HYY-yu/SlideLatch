'use client';
import { useId, useMemo, type PointerEvent, type ReactNode } from 'react';
import type { Box, LoadedTemplate, Paint, Patches, RenderElement, SourceNode } from '@/lib/pptx/types';
import { boxFor, frame, groupContent, matrixString, multiply, parentMatrix, worldFrame } from '@/lib/pptx/geometry';
import { slideLists, listPreviewCount } from '@/lib/pptx/lists';
import { safeRichText } from '@/lib/pptx/rich-text';
import { gradientOffset, presetPath } from '@/lib/pptx/render-geometry';

type Props={model:LoadedTemplate;slideIndex:number;patches:Patches;selected?:string|null;selectedMembers?:string[];interactive?:boolean;onSelect?:(key:string|null)=>void;onSelectItem?:(key:string)=>void;onDrag?:(event:PointerEvent<SVGElement>,node:SourceNode,mode:'move'|'resize')=>void;svgRef?:React.Ref<SVGSVGElement>;locale?:'zh'|'en';textPreviews?:Record<string,string>;listPreviews?:Record<string,number>;onListPreview?:(key:string,count:number)=>void};
const imageHref=(value:unknown)=>typeof value==='string'&&/^(data:image\/|blob:)/.test(value)?value:undefined;
function PaintDefs({paint,id,width,height}:{paint?:Paint;id:string;width:number;height:number}) {
  if(!paint)return null;
  if(paint.type==='image'){
    const value=paint.value as {base64?:string;blob?:string;opacity?:number};
    return <pattern id={id} width="1" height="1" patternContentUnits="objectBoundingBox"><image href={imageHref(value?.base64)||imageHref(value?.blob)} width="1" height="1" preserveAspectRatio="xMidYMid slice" opacity={value?.opacity??1}/></pattern>;
  }
  if(paint.type==='gradient'){
    const value=paint.value as {rot?:number;path?:string;colors?:{pos:string;color:string}[]};
    const stops=(value?.colors||[]).map((stop,i)=><stop key={i} offset={gradientOffset(stop.pos)} stopColor={stop.color}/>);
    return value?.path==='line'?<linearGradient id={id} x1="0" y1="0" x2="1" y2="0" gradientTransform={`rotate(${value.rot||0} .5 .5)`}>{stops}</linearGradient>:<radialGradient id={id}>{stops}</radialGradient>;
  }
  void width;void height;return null;
}
const paintValue=(paint:Paint|undefined,id:string):string=>!paint?'none':paint.type==='color'?String(paint.value||'none'):paint.type==='image'||paint.type==='gradient'?`url(#${id})`:String((paint.value as {backgroundColor?:string})?.backgroundColor||'#e8ecea');

function RichText({html,width,height,element,preview}:{html:string;width:number;height:number;element:RenderElement;preview?:string}) {
  const inset=element.textInset||{};
  const content=useMemo(()=>safeRichText(html,element.autoFit?.fontScale||1,preview),[html,element.autoFit?.fontScale,preview]);
  const align=element.vAlign==='mid'?'center':element.vAlign==='down'?'flex-end':'flex-start';
  return <foreignObject width={Math.max(1,width)} height={Math.max(1,height)} style={{pointerEvents:'none',overflow:'hidden'}}><div className="pptx-rich-text" style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:align,boxSizing:'border-box',padding:`${inset.t||0}px ${inset.r||0}px ${inset.b||0}px ${inset.l||0}px`,fontSize:18,lineHeight:1.1,overflow:'hidden',color:'#202832',whiteSpace:'normal',overflowWrap:'break-word'}}><div dangerouslySetInnerHTML={{__html:content}}/></div></foreignObject>;
}
function TableView({element,width,height}:{element:RenderElement;width:number;height:number}) {
  const rows=element.data as {text:string;fillColor?:string;rowSpan?:number;colSpan?:number;hMerge?:number;vMerge?:number;borders?:Record<string,{borderColor:string;borderWidth:number}>}[][];
  const rowHeights=element.rowHeights as number[]||[];
  const columns=element.colWidths as number[]||[];
  const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0)||1;
  let y=0;
  return <g>{(rows||[]).map((row,r)=>{
    let x=0;const h=(rowHeights[r]||1)/sum(rowHeights.length?rowHeights:rows.map(()=>1))*height;
    const cells=row.map((cell,c)=>{
      const w=(columns[c]||1)/sum(columns.length?columns:row.map(()=>1))*width;
      const cellX=x;x+=w;
      if(cell.hMerge||cell.vMerge)return null;
      const cw=w*(cell.colSpan||1),ch=h*(cell.rowSpan||1),border=cell.borders?.bottom;
      return <g key={c} transform={`translate(${cellX} ${y})`}><rect width={cw} height={ch} fill={cell.fillColor||'#fff'} stroke={border?.borderColor||'#c5dad3'} strokeWidth={border?.borderWidth||.3}/><RichText html={cell.text||''} width={cw} height={ch} element={{...element,vAlign:'mid',textInset:{l:7,r:7,t:1,b:1}}}/></g>;
    });y+=h;return <g key={r}>{cells}</g>;
  })}</g>;
}
function ChartView({element,width,height}:{element:RenderElement;width:number;height:number}) {
  const data=element.data as {key:string;values:{x:string;y:number}[];xlabels:Record<string,string>}[];
  if(!Array.isArray(data)||!data[0]?.values)return <rect width={width} height={height} fill="#eff4f1"/>;
  const colors=element.colors as string[]||['#176b50','#c18136','#c5dad3'];
  const values=data[0].values,labels=data[0].xlabels||{},type=String(element.chartType);
  const pad=32,w=Math.max(1,width-pad*1.7),h=Math.max(1,height-pad*1.5);
  const max=Math.max(1,...data.flatMap(series=>series.values.map(v=>Math.abs(v.y))));
  if(type.includes('pie')||type.includes('doughnut')){
    const total=values.reduce((sum,v)=>sum+Math.max(0,v.y),0)||1,r=Math.min(w,h)/2,cx=width/2,cy=height/2;let angle=-Math.PI/2;
    return <g>{values.map((v,i)=>{
      const next=angle+Math.max(0,v.y)/total*Math.PI*2,a=angle;angle=next;
      const d=`M ${cx} ${cy} L ${cx+r*Math.cos(a)} ${cy+r*Math.sin(a)} A ${r} ${r} 0 ${next-a>Math.PI?1:0} 1 ${cx+r*Math.cos(next)} ${cy+r*Math.sin(next)} Z`;
      return <path key={i} d={d} fill={colors[i%colors.length]||'#176b50'}/>;
    })}{type.includes('doughnut')&&<circle cx={cx} cy={cy} r={r*Number(element.holeSize||50)/100} fill="#fff"/>}</g>;
  }
  return <g><path d={`M ${pad} 0 V ${h} H ${pad+w}`} stroke="#bdc8c2" fill="none" strokeWidth=".5"/>{[0,.25,.5,.75,1].map(value=><g key={value}><path d={`M ${pad} ${h*(1-value)} H ${pad+w}`} stroke="#dce4e0" strokeWidth=".4"/><text x={pad-5} y={h*(1-value)+3} textAnchor="end" fontSize="8" fill="#63726a">{Math.round(value*max)}</text></g>)}{data.map((series,s)=>type.includes('line')?<polyline key={s} points={series.values.map((v,i)=>`${pad+(i+.5)*w/values.length},${h-v.y/max*h}`).join(' ')} fill="none" stroke={colors[s%colors.length]||'#176b50'} strokeWidth="2"/>:<g key={s}>{series.values.map((v,i)=><rect key={i} x={pad+(i+.13)*w/values.length+s*w/values.length*.7/data.length} y={h-v.y/max*h} width={w/values.length*.7/data.length} height={Math.max(0,v.y/max*h)} fill={colors[s%colors.length]||'#176b50'}/>)}</g>)}{values.map((v,i)=><text key={i} x={pad+(i+.5)*w/values.length} y={h+15} textAnchor="middle" fontSize="8" fill="#63726a">{labels[v.x]||v.x}</text>)}</g>;
}

export default function SvgSlide({model,slideIndex,patches,selected,selectedMembers=[],interactive=false,onSelect,onSelectItem,onDrag,svgRef,locale='zh',textPreviews={},listPreviews={},onListPreview}:Props) {
  const rawId=useId(),prefix=rawId.replace(/[^\w-]/g,'');
  const slide=model.deck.slides[slideIndex],source=model.slides[slideIndex];
  const registry=new Map(source.nodes.map(node=>[node.id,node]));
  const {width,height}=model.deck.size;
  const lists=interactive?slideLists(source.nodes,patches):[];
  const hidden=new Set(lists.flatMap(list=>list.items.slice(listPreviewCount(list,listPreviews)).flatMap(item=>item.nodes.map(n=>n.key))));
  function renderElement(element:RenderElement,index:number,layout=false,instance=''):ReactNode {
    const node=!layout?registry.get(String(element.id)):undefined;
    if(node&&!instance&&hidden.has(node.key))return null;
    const box=node?boxFor(node,patches):null;
    const b=box||{x:element.left,y:element.top,width:element.width,height:element.height};
    if(![b.x,b.y,b.width,b.height].every(Number.isFinite))return null;
    const key=node?.key||`layout-${index}-${element.id}`;
    const pid=`${prefix}-${instance}${layout?'layout-':''}${element.id||index}`,paint=paintValue(element.fill,pid);
    const m=node?frame(node,b):frame({rotation:element.rotate||0,flipH:!!element.isFlipH,flipV:!!element.isFlipV} as SourceNode,b);
    const image=element.fill?.type==='image';
    const pathBox=element.pathViewBox;
    let body:ReactNode;
    if(element.type==='group'){
      const content=node?groupContent(node,b):[1,0,0,1,0,0] as const;
      body=<g transform={`matrix(${content.join(' ')})`}>{element.elements?.map((e,i)=>renderElement(e,i,layout,instance))}</g>;
    }else if(element.type==='table')body=<TableView element={element} width={b.width} height={b.height}/>;
    else if(element.type==='chart')body=<ChartView element={element} width={b.width} height={b.height}/>;
    else if(element.type==='image'){
      const src=imageHref(element.base64)||imageHref(element.blob)||imageHref(element.src),crop=element.rect||{};
      const left=(crop.l||0)/100000,top=(crop.t||0)/100000,right=(crop.r||0)/100000,bottom=(crop.b||0)/100000;
      const dw=b.width/Math.max(.01,1-left-right),dh=b.height/Math.max(.01,1-top-bottom);
      body=<><defs><clipPath id={`${pid}-clip`}>{element.geom==='ellipse'?<ellipse cx={b.width/2} cy={b.height/2} rx={b.width/2} ry={b.height/2}/>:<rect width={b.width} height={b.height}/>}</clipPath></defs><image href={src} x={-left*dw} y={-top*dh} width={dw} height={dh} preserveAspectRatio="none" clipPath={`url(#${pid}-clip)`}/></>;
    }else if(element.type==='shape'||element.type==='text'){
      const stroke=element.borderWidth?element.borderColor||'#000':'none',strokeWidth=element.borderWidth||0;
      let geometry:ReactNode;
      const correctedPath=node&&presetPath(node.geometry,b.width,b.height);
      if(correctedPath)geometry=<path d={correctedPath} fill={paint} stroke={stroke} strokeWidth={strokeWidth}/>;
      else if(element.path&&pathBox&&pathBox.width>0&&pathBox.height>0)geometry=<svg width={Math.max(.01,b.width)} height={Math.max(.01,b.height)} viewBox={`${pathBox.x} ${pathBox.y} ${pathBox.width} ${pathBox.height}`} preserveAspectRatio="none" overflow="visible"><path d={element.path} fill={paint} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={element.borderType==='dashed'?'5 3':element.borderType==='dotted'?'1 2':undefined}/></svg>;
      else if(element.shapType==='ellipse')geometry=<ellipse cx={b.width/2} cy={b.height/2} rx={b.width/2} ry={b.height/2} fill={paint} stroke={stroke} strokeWidth={strokeWidth}/>;
      else if(element.shapType==='line'||b.height===0)geometry=<path d={`M0 0L${b.width} ${b.height}`} fill="none" stroke={stroke} strokeWidth={strokeWidth}/>;
      else geometry=<rect width={b.width} height={b.height} fill={paint} stroke={stroke} strokeWidth={strokeWidth}/>;
      body=<><defs><PaintDefs paint={element.fill} id={pid} width={b.width} height={b.height}/></defs>{geometry}{element.content&&b.height>0&&!image&&<RichText html={element.content} width={b.width} height={b.height} element={element} preview={node?textPreviews[node.key]:undefined}/>}</>;
    }else body=<g><rect width={b.width} height={b.height} fill="#f0ede8" stroke="#c5b999"/><text x="5" y="16" fontSize="10" fill="#756c58">{element.type}</text></g>;
    return <g key={key} id={node?`${prefix}-${instance}node-${node.id}`:undefined} transform={matrixString(m)} data-shape-id={node?.id}>
      {body}
      {interactive&&!instance&&node&&node.kind!=='grpSp'&&<rect data-hit-key={node.key} x={-1} y={-1} width={Math.max(3,b.width+2)} height={Math.max(3,b.height+2)} fill="transparent" stroke={(patches[node.key]?.name??node.name).trim().startsWith('@')?'#7768e640':'transparent'} strokeWidth=".6" vectorEffect="non-scaling-stroke" style={{cursor:'move'}} onPointerDown={event=>{event.stopPropagation();onSelect?.(node.key);onDrag?.(event,node,'move')}}/>}
    </g>;
  }
  function findElement(elements:RenderElement[],id:string):RenderElement|undefined {
    for(const element of elements){if(String(element.id)===id)return element;const child=element.elements&&findElement(element.elements,id);if(child)return child;}
  }
  const selectedNode=source.nodes.find(node=>node.key===selected),selectedBox=selectedNode?boxFor(selectedNode,patches):null;
  return <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" className="pptx-svg" viewBox={`0 0 ${width} ${height}`} role={interactive?'application':'img'} aria-label={locale==='zh'?`第 ${slideIndex+1} 页 PPT`:`Slide ${slideIndex+1}`} onPointerDown={event=>{if(event.target===event.currentTarget)onSelect?.(null)}}>
    <defs><PaintDefs paint={slide.fill} id={`${prefix}-bg`} width={width} height={height}/></defs><rect width={width} height={height} fill={paintValue(slide.fill,`${prefix}-bg`)==='none'?'#fff':paintValue(slide.fill,`${prefix}-bg`)}/>
    {[...(slide.layoutElements||[])].sort((a,b)=>(a.order||0)-(b.order||0)).map((e,i)=>renderElement(e,i,true))}
    {[...slide.elements].sort((a,b)=>(a.order||0)-(b.order||0)).map((e,i)=>renderElement(e,i))}
    {lists.map((list,listIndex)=>{
      const count=listPreviewCount(list,listPreviews),active=list.items.some(item=>item.nodes.some(n=>n.key===selected)),b=list.box;
      const first=list.items[0],last=list.items.at(-1)!;
      const dx=list.items.length>1?(last.box.x-first.box.x)/(list.items.length-1):0;
      const dy=list.items.length>1?(last.box.y-first.box.y)/(list.items.length-1):first.box.height+12;
      const title=`${locale==='zh'?'列表':'List'} ${String.fromCharCode(65+listIndex)} · ${list.dynamic?`${locale==='zh'?'可变':'Flexible'} ${list.min}–${list.max}`:`${locale==='zh'?'固定':'Fixed'} ${list.items.length}`}`;
      const labelY=Math.max(3,b.y-25),labelX=Math.max(3,b.x-5);
      return <g key={list.key} className="pptx-list-overlay">
        <rect x={b.x-5} y={b.y-5} width={b.width+10} height={b.height+10} rx="4" fill="none" stroke={list.color} strokeOpacity={active?.65:.25} strokeDasharray="5 4" pointerEvents="none"/>
        {list.items.slice(0,count).map(item=><rect key={item.index} x={item.box.x-2} y={item.box.y-2} width={item.box.width+4} height={item.box.height+4} rx="3" fill={list.color} fillOpacity=".025" stroke={list.color} strokeOpacity=".23" pointerEvents="none"/>)}
        {Array.from({length:Math.max(0,Math.min(100,count)-list.items.length)},(_,i)=>{
          const step=list.items.length+i;return <g key={step} transform={`translate(${dx*step} ${dy*step})`} opacity=".48" pointerEvents="none">{first.roots.map(root=>{const element=findElement(slide.elements,root.id);return element?<g key={root.key} transform={matrixString(parentMatrix(root,source.nodes,patches))}>{renderElement(element,0,false,`preview-${list.index}-${step}-`)}</g>:null})}</g>;
        })}
        <foreignObject x={labelX} y={labelY} width={Math.min(420,width-labelX)} height="24"><div className="pptx-list-badge" style={{borderColor:list.color+'88',color:`color-mix(in srgb, ${list.color} 60%, #1d2635)`}}><button onClick={()=>onSelectItem?.(list.controller.key)}>{title}</button>{active&&list.dynamic&&<><button aria-label={locale==='zh'?'减少预览项数':'Decrease preview items'} disabled={count<=list.min} onClick={()=>onListPreview?.(list.key,count-1)}>−</button><span>{count}</span><button aria-label={locale==='zh'?'增加预览项数':'Increase preview items'} disabled={count>=list.max} onClick={()=>onListPreview?.(list.key,count+1)}>+</button></>}</div></foreignObject>
      </g>;
    })}
    {interactive&&selectedMembers.map(key=>{const n=source.nodes.find(n=>n.key===key),b=n&&boxFor(n,patches);return n&&b?<g key={key} transform={matrixString(worldFrame(n,source.nodes,patches))} pointerEvents="none"><rect width={b.width} height={b.height} fill="#8873ff" fillOpacity=".12" stroke="#8873ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/></g>:null})}
    {interactive&&selectedNode&&selectedBox&&!hidden.has(selectedNode.key)&&<g transform={matrixString(worldFrame(selectedNode,source.nodes,patches))} className="pptx-selection">
      <rect width={Math.max(1,selectedBox.width)} height={Math.max(1,selectedBox.height)} fill="none" stroke="#8873ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
      <rect width={Math.max(1,selectedBox.width)} height={Math.max(1,selectedBox.height)} fill="transparent" style={{cursor:'move'}} onPointerDown={event=>{event.stopPropagation();onDrag?.(event,selectedNode,'move')}}/>
      <rect x={selectedBox.width-5} y={selectedBox.height-5} width="10" height="10" fill="#fff" stroke="#8873ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{cursor:'nwse-resize'}} onPointerDown={event=>{event.stopPropagation();onDrag?.(event,selectedNode,'resize')}}/>
    </g>}
  </svg>;
}
