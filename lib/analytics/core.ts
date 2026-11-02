import {safeProperties,type AnalyticsEvent,type AnalyticsProperties} from './events.ts';
export type AnalyticsClient={capture:(event:AnalyticsEvent,properties:Record<string,string|number>)=>unknown};
export type AnalyticsConfig={enabled:boolean;debug:boolean;reason?:string};
export function resolveAnalyticsConfig(input:{key?:string;host?:string;hostname:string;captureLocal?:boolean;debug?:boolean;environment:string}):AnalyticsConfig{
 const debug=input.debug??input.environment!=='production';
 if(!input.key?.trim()||!input.host?.trim())return {enabled:false,debug,reason:'not_configured'};
 try{const url=new URL(input.host);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('host');}catch{return {enabled:false,debug,reason:'invalid_host'};}
 if(['localhost','127.0.0.1','[::1]','::1'].includes(input.hostname)&&!input.captureLocal)return {enabled:false,debug,reason:'local_capture_disabled'};
 return {enabled:true,debug};
}
export function createAnalytics(config:AnalyticsConfig,loadClient:()=>Promise<AnalyticsClient>,logger:Pick<Console,'debug'|'warn'|'info'>=console){
 let pending:Promise<void>|undefined,client:AnalyticsClient|undefined,failed=false;
 const queue:{event:AnalyticsEvent;properties:Record<string,string|number>}[]=[],once=new Set<string>();
 function deliver(event:AnalyticsEvent,properties:Record<string,string|number>){try{client!.capture(event,properties);}catch(error){logger.warn('[SlideLatch] analytics.capture.failed',{event,error});}}
 function start(){
  if(!pending)pending=(async()=>{
   if(!config.enabled){if(config.debug)logger.debug('[SlideLatch] analytics.disabled',{reason:config.reason});return;}
   try{client=await loadClient();logger.info('[SlideLatch] analytics.ready');for(const item of queue.splice(0))deliver(item.event,item.properties);}
   catch(error){failed=true;queue.length=0;logger.warn('[SlideLatch] analytics.init.failed',error);}
  })();
  return pending;
 }
 function capture(event:AnalyticsEvent,properties:AnalyticsProperties={}){
  const safe=safeProperties(properties);if(config.debug)logger.debug('[SlideLatch] analytics.event',{event,properties:safe});
  if(!config.enabled||failed)return;
  if(client)deliver(event,safe);else{if(queue.length<100)queue.push({event,properties:safe});else logger.warn('[SlideLatch] analytics.queue.full',{event});void start();}
 }
 return {start,capture,captureOnce:(key:string,event:AnalyticsEvent,props:AnalyticsProperties={})=>{if(once.has(key))return;once.add(key);capture(event,props);}};
}
