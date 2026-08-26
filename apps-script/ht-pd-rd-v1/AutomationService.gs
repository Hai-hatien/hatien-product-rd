/**
 * Scheduler plumbing for R0-R8.
 * P0 rule: a trigger firing is execution evidence, but it is NOT evidence that
 * research/engineering work is complete. These handlers never fabricate flow
 * outputs. They log actual invocation and expose ready work for the worker layer.
 */
function flowScheduleRow_(flowId) {
  const row = readFlowSchedule_().find(item => String(item.FLOW_ID || '') === String(flowId));
  if (!row) throw new Error('95_Flow_Schedule thiếu flow: ' + flowId);
  return row;
}

function appendSchedulerRunLog_(input) {
  const runId = 'RUN-' + input.flowId + '-' + todayKey_() + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendObject_(RD_CONFIG.SHEETS.FLOW_RUN_LOG, {
    RUN_ID: runId,
    FLOW_ID: input.flowId,
    RD_CASE_ID: input.caseId || '',
    SCHEDULED_FOR: input.scheduledFor || '',
    TRIGGER_ID: input.triggerId || '',
    STARTED_AT: input.startedAt || nowIso_(),
    FINISHED_AT: input.finishedAt || nowIso_(),
    EXECUTION_MODE: input.executionMode || 'APPS_SCRIPT_TIME_TRIGGER',
    ATTEMPT: Number(input.attempt || 1),
    LEASE_STATUS: input.leaseStatus || 'NOT_REQUIRED',
    DEPENDENCY_STATUS: input.dependencyStatus || '',
    API_STATUS: input.apiStatus || 'NOT_CALLED',
    REPORT_ID: input.reportId || '',
    RECORDS_IMPORTED: Number(input.recordsImported || 0),
    NEXT_FLOW: input.nextFlow || '',
    RUN_STATUS: input.runStatus || 'RECORDED',
    ERROR_CODE: input.errorCode || '',
    ERROR_MESSAGE: input.errorMessage || '',
    AUDIT_ID: input.auditId || '',
    NOTES: truncate_(input.notes || '', 45000)
  });
  return runId;
}

function installedTriggerIdForHandler_(handlerName) {
  const trigger = ScriptApp.getProjectTriggers().find(t => t.getHandlerFunction() === handlerName);
  return trigger ? trigger.getUniqueId() : '';
}

function readyTasksForFlow_(flowId) {
  return readObjects_(RD_CONFIG.SHEETS.TASKS)
    .filter(row => String(row.FLOW_ID || '') === String(flowId) && String(row.STATUS || '') === 'READY');
}

function activeCaseIds_() {
  return readObjects_(RD_CONFIG.SHEETS.PORTFOLIO)
    .filter(row => !['STOPPED', 'APPROVED_HANDOVER'].includes(String(row.CASE_STATUS || '')))
    .map(row => String(row.RD_CASE_ID || ''))
    .filter(Boolean);
}

function runScheduledFlowProbe_(flowId) {
  const schedule = flowScheduleRow_(flowId);
  const startedAt = nowIso_();
  const handler = String(schedule.HANDLER || '');
  const triggerId = installedTriggerIdForHandler_(handler);

  if (String(schedule.ENABLED || '').toUpperCase() !== 'TRUE') {
    const runId = appendSchedulerRunLog_({
      flowId, startedAt, finishedAt: nowIso_(), triggerId,
      runStatus: 'DISABLED', dependencyStatus: 'NOT_EVALUATED',
      notes: 'Flow disabled in 95_Flow_Schedule; no work executed.'
    });
    return { ok: true, flowId, runId, status: 'DISABLED', readyTaskCount: 0 };
  }

  const actor = getSystemActor_();
  const caseIds = activeCaseIds_();
  caseIds.forEach(caseId => reconcileDependencies_(caseId, actor));
  const ready = readyTasksForFlow_(flowId);
  const readyCaseIds = [...new Set(ready.map(row => String(row.RD_CASE_ID || '')).filter(Boolean))];

  const status = ready.length ? 'READY_WORK_DETECTED' : 'NO_READY_WORK';
  const dependencyStatus = ready.length ? 'READY' : 'WAITING_OR_EMPTY';
  const auditId = appendAudit_({
    actor,
    action: 'SCHEDULED_FLOW_PROBE',
    entityType: 'FLOW',
    entityId: flowId,
    beforeState: 'TRIGGER_INVOKED',
    afterState: status,
    evidenceRef: triggerId,
    result: 'RECORDED',
    notes: JSON.stringify({ readyTaskIds: ready.map(row => row.TASK_ID), readyCaseIds })
  });
  const runId = appendSchedulerRunLog_({
    flowId,
    startedAt,
    finishedAt: nowIso_(),
    triggerId,
    dependencyStatus,
    runStatus: status,
    auditId,
    nextFlow: ready.length ? flowId + ':WORKER_EXECUTION_REQUIRED' : '',
    notes: JSON.stringify({ readyTaskIds: ready.map(row => row.TASK_ID), readyCaseIds, truthfulStatus: true })
  });

  // Reflect actual invocation, not a claimed completed research run.
  updateObjectById_(RD_CONFIG.SHEETS.FLOW_SCHEDULE, 'FLOW_ID', flowId, {
    LAST_RUN_AT: nowIso_(),
    LAST_RUN_STATUS: status,
    TRIGGER_STATUS: triggerId ? 'INSTALLED' : 'PENDING_INSTALL'
  });
  return { ok: true, flowId, runId, status, readyTaskCount: ready.length, readyCaseIds, triggerId };
}

function runR1Scheduled() { return runScheduledFlowProbe_('R1'); }
function runR2Scheduled() { return runScheduledFlowProbe_('R2'); }
function runR3Scheduled() { return runScheduledFlowProbe_('R3'); }
function runR4Scheduled() { return runScheduledFlowProbe_('R4'); }
function runR5Scheduled() { return runScheduledFlowProbe_('R5'); }
function runR6Scheduled() { return runScheduledFlowProbe_('R6'); }
function runR7Scheduled() { return runScheduledFlowProbe_('R7'); }
function runR8Scheduled() { return runScheduledFlowProbe_('R8'); }

function runR0DailySummary() {
  const flowProbe = runScheduledFlowProbe_('R0');
  const actor = getSystemActor_();
  const openDecisions = listOpenDecisions_();
  const openTasks = readObjects_(RD_CONFIG.SHEETS.TASKS)
    .filter(row => !isCompletedTaskStatus_(row.STATUS) && String(row.STATUS || '') !== 'STOPPED');
  const blockers = openTasks.filter(row => ['BLOCKED', 'WAITING_AUTHORIZED_APPROVAL'].includes(String(row.STATUS || '')));
  appendAudit_({
    actor,
    action: 'R0_DAILY_SUMMARY_SNAPSHOT',
    entityType: 'FLOW',
    entityId: 'R0',
    beforeState: '',
    afterState: JSON.stringify({ openDecisionCount: openDecisions.length, openTaskCount: openTasks.length, blockerCount: blockers.length }),
    evidenceRef: flowProbe.runId,
    result: 'RECORDED',
    notes: 'Aggregation only; no gate decision is auto-approved.'
  });
  return Object.assign({}, flowProbe, {
    openDecisionCount: openDecisions.length,
    openTaskCount: openTasks.length,
    blockerCount: blockers.length
  });
}
