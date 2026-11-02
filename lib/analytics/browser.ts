'use client';
import {createAnalytics,resolveAnalyticsConfig} from './core';
import {analyticsEvents,sanitizeSdkProperties,type AnalyticsEvent,type AnalyticsProperties} from './events';
let instance:ReturnType<typeof createAnalytics>|undefined;
function getAnalytics(){
 if(instance)return instance;
 const key=process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,host=process.env.NEXT_PUBLIC_POSTHOG_HOST;
 const config=resolveAnalyticsConfig({key,host,hostname:window.location.hostname,environment:process.env.NODE_ENV,captureLocal:process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL==='true',debug:process.env.NEXT_PUBLIC_ANALYTICS_DEBUG===undefined?undefined:process.env.NEXT_PUBLIC_ANALYTICS_DEBUG==='true'});
 instance=createAnalytics(config,async()=>{
  const {default:posthog}=await import('posthog-js/dist/module.no-external');
  posthog.init(key!,{
   api_host:host!,autocapture:false,capture_pageview:false,capture_pageleave:false,disable_session_recording:true,disable_surveys:true,
   advanced_disable_feature_flags:true,disable_product_tours:true,disable_web_experiments:true,capture_performance:false,enable_heatmaps:false,capture_exceptions:false,person_profiles:'never',rageclick:false,respect_dnt:true,persistence:'localStorage',
   on_request_error:response=>console.warn('[SlideLatch] analytics.request.failed',{status:response.statusCode}),
   before_send:event=>{
    if(!event||!analyticsEvents.includes(event.event as AnalyticsEvent))return null;
    event.properties=sanitizeSdkProperties(event.properties??{});return event;
   },
  });
  return {capture:(event,properties)=>posthog.capture(event,properties)};
 });
 return instance;
}
function dimensions(){const locale=window.location.pathname.split('/')[1];return {locale,page_path:window.location.pathname,environment:process.env.NODE_ENV};}
export function startAnalytics(){if(typeof window==='undefined')return;return getAnalytics().start();}
export function track(event:AnalyticsEvent,properties:AnalyticsProperties={}){if(typeof window!=='undefined')getAnalytics().capture(event,{...dimensions(),...properties});}
export function trackOnce(key:string,event:AnalyticsEvent,properties:AnalyticsProperties={}){if(typeof window!=='undefined')getAnalytics().captureOnce(key,event,{...dimensions(),...properties});}
