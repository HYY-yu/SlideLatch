export type Mark = { type:'fixed'|'text'|'image'|'icon'|'number'|'table'|'chart'|'background'|'group'|'raw'; min:number; max:number; index:number; item:number; digits:number; dynamic:boolean; raw:string };
export function parseMark(name:string):Mark {
  const base:Mark={type:'fixed',min:2,max:24,index:1,item:1,digits:2,dynamic:false,raw:name};
  if(!name.trim().startsWith('@'))return base;
  const group=/^@(\d+)@(\d+)(?:\[(\d+)(?:-(\d+))?\])?$/.exec(name.trim());
  if(group)return {...base,type:'group',index:+group[1],item:+group[2],dynamic:!!group[3],min:+(group[3]||1),max:+(group[4]||group[3]||1)};
  const prefix=/^@(\d+)@(\d+)\s*/.exec(name);
  const raw=prefix?'@'+name.slice(prefix[0].length):name.trim();
  const text=/^@文本(?:框)?(?:\[(\d+)(?:-(\d+))?\])?$/.exec(raw);
  const shared=prefix?{index:+prefix[1],item:+prefix[2]}:{};
  if(text)return {...base,...shared,type:'text',min:+(text[1]||2),max:+(text[2]||text[1]||24)};
  const image=/^@图片-(\d+)$/.exec(raw); if(image)return {...base,...shared,type:'image',index:+image[1]};
  const number=/^@序号(?:-(0*1))?$/.exec(raw);if(number)return {...base,...shared,type:'number',digits:(number[1]||'01').length};
  const known:Record<string,Mark['type']>={'@图标':'icon','@表格':'table','@图表':'chart','@背景':'background'};
  return {...base,...shared,type:known[raw]||'raw'};
}
export function markName(mark:Mark, original:string, isGroup:boolean):string {
  if(mark.type==='raw')throw new Error('UNSUPPORTED_MARK');
  if(mark.type==='fixed')return original.startsWith('@')?'fixed-content':original;
  if(mark.type==='group')return `@${mark.index}@${mark.item}${mark.dynamic?`[${mark.min}-${mark.max}]`:''}`;
  let token:string;
  switch(mark.type){
    case 'text':token=`文本[${mark.min}-${mark.max}]`;break;
    case 'image':token=`图片-${mark.index}`;break;
    case 'number':token=`序号-${'0'.repeat(mark.digits-1)}1`;break;
    default:token=({icon:'图标',table:'表格',chart:'图表',background:'背景'} as const)[mark.type];
  }
  const prefix=!isGroup?/^@(\d+)@(\d+)\s*/.exec(original):null;
  return prefix?`@${prefix[1]}@${prefix[2]} ${token}`:`@${token}`;
}
export function markError(mark:Mark):boolean {
  if(mark.type==='text'||mark.type==='group'&&mark.dynamic)return !Number.isSafeInteger(mark.min)||!Number.isSafeInteger(mark.max)||mark.min<(mark.type==='text'?0:1)||mark.max<mark.min;
  if(mark.type==='image'||mark.type==='group')return !Number.isInteger(mark.index)||mark.index<1||!Number.isInteger(mark.item)||mark.item<1;
  if(mark.type==='number')return !Number.isInteger(mark.digits)||mark.digits<1||mark.digits>6;
  return mark.type==='raw';
}
