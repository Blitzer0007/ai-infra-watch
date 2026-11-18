/** Read-only observation of the scheduler and bounded forecast-evaluation window.
 * Never interprets an absent job, expired window or missing outcome as success.
 */
export type ForecastOpsState = 'unavailable'|'review-required'|'last-run-success'|'no-recorded-run'|'unknown';
type SchedulerInput = {id?:unknown;status?:unknown;conclusion?:unknown;lastRunAt?:unknown;isStuck?:unknown;stuckRunCount?:unknown;recentFailureCount?:unknown;recentSkippedCount?:unknown;lastRunAgeMs?:unknown};
type EvaluationInput = {
  version?:unknown;coverage?:{returnedRows?:unknown;truncated?:unknown;asOfUtcDate?:unknown};
  lifecycle?:{pendingDueForReview?:unknown;pendingNotDue?:unknown;pendingUnknownTarget?:unknown;verifiedUnscorable?:unknown;independentScorable?:unknown;overlappingExcluded?:unknown};
};
const count=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
const finiteAge=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const timestamp=(value:unknown):string|null=>typeof value==='string'&&!Number.isNaN(Date.parse(value))&&/T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)?value:null;

export function summarizeForecastOperations(jobRows:unknown, protocol:unknown, protocolStatus:unknown='unavailable') {
  const rows=Array.isArray(jobRows)?jobRows:[];
  const raw=rows.find((item:unknown)=>item&&typeof item==='object'&&(item as SchedulerInput).id==='forecast-auto-tracker');
  const job:SchedulerInput|null=raw&&typeof raw==='object'?raw as SchedulerInput:null;
  const lastRunAt=timestamp(job?.lastRunAt);
  const failures=count(job?.recentFailureCount),skipped=count(job?.recentSkippedCount),stuck=count(job?.stuckRunCount);
  const runStatus=typeof job?.status==='string'?job.status.toLowerCase():'unknown';
  const conclusion=typeof job?.conclusion==='string'?job.conclusion.toLowerCase():'unknown';
  const hasBadRun=job?.isStuck===true||(stuck!==null&&stuck>0)||(failures!==null&&failures>0)||(skipped!==null&&skipped>0)||
    ['failure','failed','stuck','cancelled','timed_out'].includes(runStatus)||
    ['failure','failed','skipped','cancelled','timed_out'].includes(conclusion);
  let schedulerState:ForecastOpsState='unknown';
  if(!job||runStatus==='unavailable')schedulerState='unavailable';
  else if(hasBadRun)schedulerState='review-required';
  else if(runStatus==='no_runs')schedulerState='no-recorded-run';
  else if(conclusion==='success'&&lastRunAt!==null&&failures===0&&skipped===0&&stuck===0)schedulerState='last-run-success';
  const sched={
    state:schedulerState,lastRunAt,lastRunAgeMs:finiteAge(job?.lastRunAgeMs),
    recentFailures:failures,recentSkips:skipped,stuckRuns:stuck,
  };

  const value:EvaluationInput|null=protocol&&typeof protocol==='object'&&!Array.isArray(protocol)?protocol as EvaluationInput:null;
  const usable=protocolStatus==='ready'&&value?.version==='forecast-evaluation-v1'&&value.lifecycle&&typeof value.lifecycle==='object'&&value.coverage&&typeof value.coverage==='object';
  const lifecycle=usable?value.lifecycle:null;
  const coverage=usable?value.coverage:null;
  const due=count(lifecycle?.pendingDueForReview);
  const notDue=count(lifecycle?.pendingNotDue);
  const dateUnknown=count(lifecycle?.pendingUnknownTarget);
  const invalid=count(lifecycle?.verifiedUnscorable);
  const independent=count(lifecycle?.independentScorable);
  const overlap=count(lifecycle?.overlappingExcluded);
  const returnedRows=count(coverage?.returnedRows);
  const partial=usable&&coverage?.truncated===true;
  const windowState=usable&&due!==null&&invalid!==null
    ? due>0||invalid>0?'review-required':'observed-window'
    : 'unavailable';

  return {
    scheduler:sched,
    evaluation:{
      state:windowState,
      dueForReview:due,pendingNotDue:notDue,pendingUnknownDate:dateUnknown,
      verifiedUnscorable:invalid,independentScorable:independent,overlappingExcluded:overlap,
      returnedRows,windowTruncated:usable?Boolean(coverage?.truncated):null,
      asOfUtcDate:usable&&typeof coverage?.asOfUtcDate==='string'?coverage.asOfUtcDate:null,
    },
    conclusion: schedulerState==='review-required'||windowState==='review-required'?'attention':
      schedulerState==='unavailable'||windowState==='unavailable'||schedulerState==='unknown'||schedulerState==='no-recorded-run'?'incomplete':'observed-only',
    note:'The returned forecast window is not the entire database. Last scheduler success does not prove valid market outcomes, timely source access, cross-worker quotas, or investment accuracy.',
  } as const;
}
