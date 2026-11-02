export type SupportState={likes:number;prompted:boolean;invitationOpen:boolean};
export const emptySupport:SupportState={likes:0,prompted:false,invitationOpen:false};
export const supportStorageKey='slidelatch.support.v1';
export function restoreSupport(raw:string|null):SupportState{
 if(!raw)return {...emptySupport};
 const parsed:unknown=JSON.parse(raw);
 if(!parsed||typeof parsed!=='object')throw new Error('INVALID_SUPPORT_STATE');
 const value=parsed as Partial<SupportState>;
 if(!Number.isSafeInteger(value.likes)||(value.likes as number)<0||typeof value.prompted!=='boolean')throw new Error('INVALID_SUPPORT_STATE');
 return {likes:value.likes!,prompted:value.prompted,invitationOpen:false};
}
export function likeSupport(state:SupportState):SupportState{
 const likes=Math.min(Number.MAX_SAFE_INTEGER,state.likes+1),show=likes>3&&!state.prompted;
 return {likes,prompted:state.prompted||show,invitationOpen:state.invitationOpen||show};
}
export function dismissSupportInvitation(state:SupportState):SupportState{return {...state,prompted:true,invitationOpen:false};}
export function serializeSupport(state:SupportState):string{return JSON.stringify({likes:state.likes,prompted:state.prompted});}
