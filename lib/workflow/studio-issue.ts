import type {SourceSlide} from '../pptx/types.ts';

export function locateAuthorIssue(slides:SourceSlide[],issue:string):{page:number;key:string|null}|null{
  const numbered=/^(\d+)\s*\/\s*([^:]+):/.exec(issue);
  const page=numbered?Number(numbered[1])-1:slides.findIndex(slide=>issue.includes(slide.path));
  const slide=slides[page];if(!slide)return null;
  const node=slide.nodes.find(node=>issue.split(/\s+/).some(token=>token.replace(/[:,;]$/,'')===node.key))??(numbered?slide.nodes.find(node=>node.id===numbered[2].trim()):undefined);
  return {page,key:node?.key??null};
}
