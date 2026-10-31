import JSZip from 'jszip';
import type { Box, GroupMember, Patches, SourceNode, SourceSlide } from './types';

export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
};
export const EMU_PER_PT = 12700;
const shapeTypes = new Set(['sp', 'pic', 'grpSp', 'graphicFrame', 'cxnSp']);
export const children = (el: Node): Element[] => Array.from(el.childNodes).filter(node => node.nodeType === 1) as Element[];
export const child = (el: Node, name: string): Element | undefined => children(el).find(node => node.localName === name);
function descendants(el: Element | Document, ns: string, name: string): Element[] { return Array.from(el.getElementsByTagNameNS(ns, name)); }
function parseXml(text: string, path: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(`XML_UNSAFE: ${path}`);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`XML_PARSE: ${path}`);
  return doc;
}
function resolvePart(base: string, target: string) {
  const path = new URL(target, `https://pptx.local/${base}`).pathname.slice(1);
  if (!path.startsWith('ppt/')) throw new Error(`PART_PATH: ${target}`);
  return path;
}
export function ownProperties(shape: Element) {
  const nv = children(shape).find(node => node.localName.startsWith('nv'));
  return nv ? child(nv, 'cNvPr') : undefined;
}
export function transform(shape: Element): Element | undefined {
  if (shape.localName === 'graphicFrame') return child(shape, 'xfrm');
  const properties = child(shape, shape.localName === 'grpSp' ? 'grpSpPr' : 'spPr');
  return properties && child(properties, 'xfrm');
}
function readBox(xfrm: Element | undefined, offName = 'off', extName = 'ext'): Box | null {
  if (!xfrm) return null;
  const off = child(xfrm, offName), ext = child(xfrm, extName);
  if (!off || !ext) return null;
  return { x: Number(off.getAttribute('x'))/EMU_PER_PT, y: Number(off.getAttribute('y'))/EMU_PER_PT, width: Number(ext.getAttribute('cx'))/EMU_PER_PT, height: Number(ext.getAttribute('cy'))/EMU_PER_PT };
}
function shapeText(shape: Element): string {
  const body = child(shape, 'txBody');
  if (!body) return descendants(shape, NS.a, 't').map(t => t.textContent || '').join('');
  const text = (node: Element): string => node.localName === 't' ? node.textContent || '' : node.localName === 'br' ? '\n' : children(node).map(text).join('');
  return children(body).filter(node => node.localName === 'p').map(text).join('\n');
}
export async function readSourceSlides(bytes: ArrayBuffer | Uint8Array): Promise<SourceSlide[]> {
  const zip = await JSZip.loadAsync(bytes);
  const presentation = zip.file('ppt/presentation.xml'), relations = zip.file('ppt/_rels/presentation.xml.rels');
  if (!presentation || !relations) throw new Error('PPTX_STRUCTURE: missing presentation');
  const relDoc = parseXml(await relations.async('string'), 'presentation.xml.rels');
  const targets = new Map(descendants(relDoc, '*', 'Relationship').map(rel => [rel.getAttribute('Id'), rel.getAttribute('Target')!]));
  const pres = parseXml(await presentation.async('string'), 'presentation.xml');
  const paths = descendants(pres, NS.p, 'sldId').map(id => {
    const target = targets.get(id.getAttributeNS(NS.r,'id'));
    if (!target) throw new Error('PPTX_SLIDE_RELATION');
    return resolvePart('ppt/presentation.xml', target);
  });
  return Promise.all(paths.map(async path => {
    const part = zip.file(path); if (!part) throw new Error(`PPTX_PART: ${path}`);
    const doc = parseXml(await part.async('string'), path);
    const tree = descendants(doc, NS.p, 'spTree')[0];
    if (!tree) throw new Error(`PPTX_SLIDE_TREE: ${path}`);
    const nodes: SourceNode[] = [];
    function visit(parent: Element, parentId: string | null) {
      for (const shape of children(parent).filter(node=>shapeTypes.has(node.localName))) {
        const props = ownProperties(shape); const id = props?.getAttribute('id');
        if (!id) throw new Error(`PPTX_SHAPE_ID: ${path}`);
        if (nodes.some(node => node.id === id)) throw new Error(`PPTX_DUPLICATE_ID: ${path}/${id}`);
        const xfrm = transform(shape), name = props!.getAttribute('name') || '';
        const properties = child(shape, 'spPr'), preset = properties && child(properties, 'prstGeom');
        const adjustments: Record<string, number> = {};
        const av = preset && child(preset, 'avLst');
        for (const guide of av ? children(av) : []) {
          const match = /^val\s+(-?\d+(?:\.\d+)?)$/.exec(guide.getAttribute('fmla') || '');
          if (match) adjustments[guide.getAttribute('name') || ''] = Number(match[1]);
        }
        const node: SourceNode = {
          key: `${path}#${id}`, slidePath:path, id, name, kind:shape.localName, parentId,
          children:[], box:readBox(xfrm), childBox:shape.localName==='grpSp'?readBox(xfrm,'chOff','chExt'):null,
          rotation:Number(xfrm?.getAttribute('rot') || 0)/60000,
          flipH:xfrm?.getAttribute('flipH')==='1', flipV:xfrm?.getAttribute('flipV')==='1',
          text:shape.localName==='grpSp'?'':shapeText(shape), marked:name.trim().startsWith('@'),
          geometry:preset?{preset:preset.getAttribute('prst') || '',adjustments}:undefined,
          hasImage:shape.localName==='pic'||!!(properties&&child(properties,'blipFill')),
          hasTextBody:!!child(shape,'txBody'),
          dataKind:descendants(shape,NS.a,'graphicData')[0]?.getAttribute('uri')?.endsWith('/table')?'table':descendants(shape,NS.a,'graphicData')[0]?.getAttribute('uri')?.endsWith('/chart')?'chart':undefined,
        };
        nodes.push(node);
        if (parentId) nodes.find(node=>node.id===parentId)!.children.push(id);
        if (shape.localName==='grpSp') visit(shape,id);
      }
    }
    visit(tree,null);
    return { path, nodes };
  }));
}

function validateBox(box: Box) {
  if (![box.x,box.y,box.width,box.height].every(Number.isFinite) || box.width<0 || box.height<0) throw new Error('PATCH_GEOMETRY');
}
/** Native tables store their dimensions in both the frame and the row/column grid. */
function resizeTable(shape: Element, ext: Element, box: Box) {
  const table = descendants(shape, NS.a, 'tbl')[0];
  if (!table) return;
  const resize = (items: Element[], attribute: string, target: number) => {
    const total = items.reduce((sum, item) => sum + Number(item.getAttribute(attribute)), 0);
    if (!items.length || total <= 0) throw new Error('PATCH_TABLE_GEOMETRY');
    let assigned = 0;
    items.forEach((item, index) => {
      const size = index === items.length - 1 ? target - assigned : Math.round(Number(item.getAttribute(attribute)) / total * target);
      item.setAttribute(attribute, String(size));
      assigned += size;
    });
  };
  const width = Math.round(box.width * EMU_PER_PT), height = Math.round(box.height * EMU_PER_PT);
  if (width !== Number(ext.getAttribute('cx'))) resize(descendants(table, NS.a, 'gridCol'), 'w', width);
  if (height !== Number(ext.getAttribute('cy'))) resize(children(table).filter(item => item.localName === 'tr'), 'h', height);
}
/** Replace semantic placeholder text, retaining body, paragraph and first-run formatting. */
function writeShapeText(shape: Element, text: string) {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('PATCH_TEXT');
  const body = child(shape, 'txBody');
  if (!body || !['sp', 'cxnSp'].includes(shape.localName)) throw new Error('PATCH_TEXT_TARGET');
  const doc = shape.ownerDocument!;
  const paragraphs = children(body).filter(node => node.localName === 'p');
  const first = paragraphs[0];
  const paragraph = first?.cloneNode(false) as Element || doc.createElementNS(NS.a, 'a:p');
  const properties = first && child(first, 'pPr');
  if (properties) paragraph.appendChild(properties.cloneNode(true));
  const style = first && descendants(first, NS.a, 'rPr')[0];
  text.split('\n').forEach((line, index) => {
    if (index) paragraph.appendChild(doc.createElementNS(NS.a, 'a:br'));
    const run = doc.createElementNS(NS.a, 'a:r');
    if (style) run.appendChild(style.cloneNode(true));
    const content = doc.createElementNS(NS.a, 'a:t');
    content.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    content.textContent = line;
    run.appendChild(content);paragraph.appendChild(run);
  });
  const end = first && child(first, 'endParaRPr');
  if (end) paragraph.appendChild(end.cloneNode(true));
  for (const original of paragraphs) body.removeChild(original);
  body.appendChild(paragraph);
}
/** Patch original names, semantic text and layout. Untouched ZIP parts retain their bytes. */
export async function writePptx(bytes: ArrayBuffer | Uint8Array, patches: Patches): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const grouped = new Map<string, [string, Patches[string]][]>();
  for (const [key, patch] of Object.entries(patches)) {
    const index = key.lastIndexOf('#'); const path = key.slice(0,index), id = key.slice(index+1);
    if (index<0 || !/^ppt\/slides\/slide\d+\.xml$/.test(path) || !/^\d+$/.test(id)) throw new Error(`PATCH_TARGET: ${key}`);
    grouped.set(path,[...(grouped.get(path)||[]),[id,patch]]);
  }
  for (const [path, updates] of grouped) {
    const original = zip.file(path); if (!original) throw new Error(`PATCH_PART: ${path}`);
    const doc = parseXml(await original.async('string'),path);
    const tree=descendants(doc,NS.p,'spTree')[0];
    for(const [id,patch] of updates){
      if(!patch.group)continue;
      const group=patch.group;
      if(!group.members.length||!tree)throw new Error('GROUP_EMPTY');
      validateBox(group.box);
      const findShape=(target:string)=>descendants(doc,NS.p,'cNvPr').find(el=>el.getAttribute('id')===target)?.parentNode?.parentNode as Element|undefined;
      const old=findShape(id);
      if(old&&(old.localName!=='grpSp'||old.parentNode!==tree))throw new Error('GROUP_TARGET');
      const occupied=new Set<string>();
      const locate=(m:GroupMember)=>{
        if(occupied.has(m.key)||m.key.slice(0,m.key.lastIndexOf('#'))!==path)throw new Error('GROUP_DUPLICATE_MEMBER');occupied.add(m.key);
        const shape=findShape(m.key.slice(m.key.lastIndexOf('#')+1));
        if(!shape||shape===old||shape.localName==='graphicFrame'||shape.parentNode!==tree&&shape.parentNode!==old)throw new Error('GROUP_MEMBER');
        const xfrm=transform(shape);if(!xfrm||!child(xfrm,'off')||!child(xfrm,'ext'))throw new Error('GROUP_MEMBER_GEOMETRY');
        validateBox(m.box);if(!Number.isFinite(m.rotation))throw new Error('GROUP_MEMBER_ROTATION');
        return {m,shape,xfrm};
      };
      const members=group.members.map(locate),released=group.released.map(locate);
      if(old&&children(old).filter(el=>shapeTypes.has(el.localName)).some(el=>![...members,...released].some(v=>v.shape===el)))throw new Error('GROUP_UNACCOUNTED_CHILD');
      const root=old??doc.createElementNS(NS.p,'p:grpSp');
      if(!old){
        const nv=doc.createElementNS(NS.p,'p:nvGrpSpPr'),props=doc.createElementNS(NS.p,'p:cNvPr');props.setAttribute('id',id);props.setAttribute('name',patch.name??'Group');nv.appendChild(props);nv.appendChild(doc.createElementNS(NS.p,'p:cNvGrpSpPr'));nv.appendChild(doc.createElementNS(NS.p,'p:nvPr'));root.appendChild(nv);
        const sp=doc.createElementNS(NS.p,'p:grpSpPr');sp.appendChild(doc.createElementNS(NS.a,'a:xfrm'));root.appendChild(sp);
        const anchor=children(tree).find(el=>members.some(v=>v.shape===el));tree.insertBefore(root,anchor??null);
      }
      const gx=transform(root)!;
      for(const attr of ['rot','flipH','flipV'])gx.removeAttribute(attr);
      for(const [tag,attrs]of [['off',{x:group.box.x,y:group.box.y}],['ext',{cx:group.box.width,cy:group.box.height}],['chOff',{x:group.box.x,y:group.box.y}],['chExt',{cx:group.box.width,cy:group.box.height}]] as const){
        let el=child(gx,tag);if(!el){el=doc.createElementNS(NS.a,`a:${tag}`);gx.appendChild(el);}for(const [name,value]of Object.entries(attrs))el.setAttribute(name,String(Math.round(value*EMU_PER_PT)));
      }
      for(const {m,shape,xfrm}of [...members,...released]){
        const off=child(xfrm,'off')!,ext=child(xfrm,'ext')!;
        off.setAttribute('x',String(Math.round(m.box.x*EMU_PER_PT)));off.setAttribute('y',String(Math.round(m.box.y*EMU_PER_PT)));ext.setAttribute('cx',String(Math.round(m.box.width*EMU_PER_PT)));ext.setAttribute('cy',String(Math.round(m.box.height*EMU_PER_PT)));
        xfrm.setAttribute('rot',String(Math.round(m.rotation*60000)));xfrm.setAttribute('flipH',m.flipH?'1':'0');xfrm.setAttribute('flipV',m.flipV?'1':'0');
        if(members.some(v=>v.shape===shape))root.appendChild(shape);else tree.insertBefore(shape,root.nextSibling);
      }
    }
    for (const [id, patch] of updates) {
      const props = descendants(doc,NS.p,'cNvPr').find(el=>el.getAttribute('id')===id);
      const shape = props?.parentNode?.parentNode as Element | undefined;
      if (!props || !shape || !shapeTypes.has(shape.localName)) throw new Error(`PATCH_SHAPE: ${path}#${id}`);
      if (patch.name !== undefined) {
        if (patch.name.length>240 || /[\u0000-\u001f]/.test(patch.name)) throw new Error('PATCH_NAME');
        props.setAttribute('name',patch.name);
      }
      if (patch.text !== undefined) writeShapeText(shape, patch.text.replace(/\r\n?/g, '\n'));
      if (patch.box) {
        validateBox(patch.box);
        const xfrm = transform(shape);
        // Inherited placeholders need a full inheritance resolver before geometry can be changed.
        if (!xfrm || !child(xfrm,'off') || !child(xfrm,'ext')) throw new Error(`PATCH_INHERITED_GEOMETRY: ${path}#${id}`);
        const off = child(xfrm,'off')!, ext=child(xfrm,'ext')!;
        resizeTable(shape, ext, patch.box);
        off.setAttribute('x',String(Math.round(patch.box.x*EMU_PER_PT)));
        off.setAttribute('y',String(Math.round(patch.box.y*EMU_PER_PT)));
        ext.setAttribute('cx',String(Math.round(patch.box.width*EMU_PER_PT)));
        ext.setAttribute('cy',String(Math.round(patch.box.height*EMU_PER_PT)));
      }
    }
    zip.file(path,new XMLSerializer().serializeToString(doc),{createFolders:false});
  }
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
