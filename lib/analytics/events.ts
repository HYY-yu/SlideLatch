export const analyticsEvents=[
 'landing_viewed','showcase_viewed','showcase_case_selected','showcase_feature_selected','showcase_preview_opened','showcase_download_clicked',
 'workbench_viewed','workbench_started','workbench_export_succeeded','workbench_export_failed','workbench_download_clicked',
 'support_clicked','survey_invitation_shown','survey_invitation_accepted','survey_invitation_dismissed','trial_cta_clicked','survey_form_opened','survey_submitted','survey_form_closed','survey_form_load_failed',
] as const;
export type AnalyticsEvent=typeof analyticsEvents[number];
export type AnalyticsProperties=Record<string,unknown>;
/** Accept product dimensions only. PPT text, form answers, email and full URLs never cross this boundary. */
export function safeProperties(input:AnalyticsProperties):Record<string,string|number>{
 const output:Record<string,string|number>={};
 const enums:Record<string,readonly string[]>={
  app:['slidelatch'],
  locale:['zh','en'],entry_point:['header','results','footer','support_survey'],case_id:['growth','efficiency','original'],
  feature:['text','list','image','chart'],outcome:['submitted','abandoned'],reason:['tally_load_failed','write_failed'],environment:['development','production','test'],
 };
 for(const [key,value]of Object.entries(input)){
  if(Array.isArray(enums[key])&&typeof value==='string'&&enums[key].includes(value))output[key]=value;
  if(key==='form_id'&&typeof value==='string'&&/^[A-Za-z0-9]{5,24}$/.test(value))output[key]=value;
  if(key==='like_count'&&typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)output[key]=value;
  if(key==='page_path'&&typeof value==='string'&&/^\/(zh|en)\/?$/.test(value))output[key]=value;
 }
 return output;
}
/** Strip SDK URL/referrer fields too: a visitor may arrive with personal data in the query string. */
export function sanitizeSdkProperties(input:AnalyticsProperties):AnalyticsProperties{
 const output={...input};
 for(const key of Object.keys(output)){
  if(/url|referr|utm_|gclid|fbclid|email|initial_person_info/i.test(key))delete output[key];
 }
 return output;
}
