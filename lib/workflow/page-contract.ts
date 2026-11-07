import type { PageContract } from '../pptx/types.ts';
export const PAGE_TYPES = ['封面页','目录页','章节过渡页','内容页','结尾页'] as const;
export const PAGE_CONTRACT_SHAPE = 'slidelatch-page-contract';
export const pagePatchKey = (path:string) => `${path}#@page`;
export function validatePageContract(value:unknown):PageContract {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('PAGE_CONTRACT_SCHEMA');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['pageType','logic'].includes(k))||!PAGE_TYPES.includes(v.pageType as PageContract['pageType'])||!Array.isArray(v.logic)||v.logic.length>20)throw new Error('PAGE_CONTRACT_SCHEMA');
  const logic=v.logic.map(line=>{
    if(typeof line!=='string'||!line.trim()||line.length>300||/[\u0000-\u001f\u007f<>]|(?:[a-z][a-z0-9+.-]*:\/\/)|(?:\b[a-z][a-z0-9+.-]*:|www\.)/i.test(line)||/^[@#]/.test(line.trim())||/逻辑关系/.test(line)||/^(?:(封面|目录|章节过渡|内容|结尾)(页)?|页面类型|属性)$/.test(line.trim()))throw new Error('PAGE_CONTRACT_LOGIC');
    return line.trim();
  });
  if(new Set(logic).size!==logic.length)throw new Error('PAGE_CONTRACT_LOGIC');
  return {pageType:v.pageType as PageContract['pageType'],logic};
}
export function pageContractText(value:PageContract):string {
  const contract=validatePageContract(value);
  return [contract.pageType,...(contract.logic.length?['逻辑关系',...contract.logic]:[])].join('\n');
}
/** Recognize the existing compiler's supported role notes, without changing speaker notes. */
export function parsePageContract(text:string):PageContract|undefined {
  let pageType:PageContract['pageType']|undefined,inLogic=false;const logic:string[]=[];
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim().replace(/^[@#]/,'').trim();if(!line)continue;
    if(/逻辑关系/.test(line)){inLogic=true;continue;}
    const role=PAGE_TYPES.find(type=>line===type||`${line}页`===type);
    if(role){pageType=role;inLogic=false;continue;}
    if(inLogic&&!/^(页面类型|属性)$/.test(line))logic.push(line);
  }
  return pageType?{pageType,logic:[...new Set(logic)]}:undefined;
}
