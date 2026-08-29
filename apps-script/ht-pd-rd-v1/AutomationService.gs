/**
 * Scheduled R0-R8 execution.
 * Trigger evidence and model execution evidence are written separately and truthfully.
 */
function flowScheduleRow_(flowId) {
  const row = readFlowSchedule_().find(item => String(item.FLOW_ID || '') === String(flowId));
  if (!row) throw new Error('95_Flow_Schedule thiếu flow: ' + flowId);
  return row;
}

function schedulerRunId_(flowId) {
  return 'RUN-' + flowId + '-' + todayKey_() + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function appendSchedulerRunLog_(input) {
  const runId = input.runId || schedulerRunId_(input.flowId);
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

function runScheduledFlowWorker_(flowId) {
  const schedule = flowScheduleRow_(flowId);
  const startedAt = nowIso_();
  const handler = String(schedule.HANDLER || '');
  const triggerId = installedTriggerIdForHandler_(handler);
  const runId = schedulerRunId_(flowId);

  if (String(schedule.ENABLED || '').toUpperCase() !== 'TRUE') {
    appendSchedulerRunLog_({
      runId, flowId, startedAt, finishedAt: nowIso_(), triggerId,
      runStatus: 'DISABLED', dependencyStatus: 'NOT_EVALUATED',
      notes: 'Flow disabled in 95_Flow_Schedule; no work executed.'
    });
    return { ok: true, flowId, runId, status: 'DISABLED', readyTaskCount: 0 };
  }

  const actor = getSystemActor_();
  activeCaseIds_().forEach(caseId => reconcileDependencies_(caseId, actor));
  const ready = readyTasksForFlow_(flowId);

  if (!ready.length) {
    const auditId = appendAudit_({
      actor,
      action: 'SCHEDULED_FLOW_WORKER',
      entityType: 'FLOW',
      entityId: flowId,
      beforeState: 'TRIGGER_INVOKED',
      afterState: 'NO_READY_WORK',
      evidenceRef: triggerId,
      result: 'RECORDED',
      notes: JSON.stringify({ readyTaskIds: [] })
    });
    appendSchedulerRunLog_({
      runId, flowId, startedAt, finishedAt: nowIso_(), triggerId,
      dependencyStatus: 'WAITING_OR_EMPTY', apiStatus: 'NOT_CALLED',
      runStatus: 'NO_READY_WORK', auditId,
      notes: JSON.stringify({ readyTaskIds: [], truthfulStatus: true })
    });
    updateObjectById_(RD_CONFIG.SHEETS.FLOW_SCHEDULE, 'FLOW_ID', flowId, {
      LAST_RUN_AT: nowIso_(), LAST_RUN_STATUS: 'NO_READY_WORK',
      TRIGGER_STATUS: triggerId ? 'INSTALLED' : 'PENDING_INSTALL'
    });
    return { ok: true, flowId, runId, status: 'NO_READY_WORK', readyTaskCount: 0 };
  }

  const limit = Math.max(1, Number(RD_CONFIG.GEMINI.MAX_TASKS_PER_RUN || 1));
  const selected = ready.slice(0, limit);
  const results = selected.map(task => executeReadyTaskWorker_(flowId, task, schedule, runId));
  const completed = results.filter(item => item.status === 'HANDOFF_READY');
  const failed = results.filter(item => item.status === 'ERROR');
  const reportIds = completed.map(item => item.reportId);
  const runStatus = failed.length
    ? (completed.length ? 'WORKER_PARTIAL_SUCCESS' : 'WORKER_FAILED')
    : 'WORKER_COMPLETED';
  const apiStatus = completed.length ? 'CALLED' : 'CALL_FAILED';
  const readyCaseIds = [...new Set(selected.map(row => String(row.RD_CASE_ID || '')).filter(Boolean))];
  const auditId = appendAudit_({
    actor,
    action: 'SCHEDULED_FLOW_WORKER',
    entityType: 'FLOW',
    entityId: flowId,
    beforeState: 'READY_WORK_DETECTED',
    afterState: runStatus,
    evidenceRef: reportIds.join('|') || triggerId,
    result: failed.length ? 'NEEDS_ACTION' : 'RECORDED',
    notes: JSON.stringify({ results, unprocessedReadyCount: Math.max(0, ready.length - selected.length) })
  });
  appendSchedulerRunLog_({
    runId,
    flowId,
    caseId: readyCaseIds.length === 1 ? readyCaseIds[0] : '',
    startedAt,
    finishedAt: nowIso_(),
    triggerId,
    dependencyStatus: 'READY',
    apiStatus,
    reportId: reportIds.join('|'),
    recordsImported: 0,
    nextFlow: 'HUMAN_REVIEW_REQUIRED',
    runStatus,
    errorCode: failed.length ? 'GEMINI_WORKER_ERROR' : '',
    errorMessage: failed.map(item => item.taskId + ': ' + item.error).join(' | '),
    auditId,
    notes: JSON.stringify({ results, readyCaseIds, unprocessedReadyCount: Math.max(0, ready.length - selected.length), truthfulStatus: true })
  });
  updateObjectById_(RD_CONFIG.SHEETS.FLOW_SCHEDULE, 'FLOW_ID', flowId, {
    LAST_RUN_AT: nowIso_(), LAST_RUN_STATUS: runStatus,
    TRIGGER_STATUS: triggerId ? 'INSTALLED' : 'PENDING_INSTALL'
  });
  return { ok: failed.length === 0, flowId, runId, status: runStatus, apiStatus, reportIds, results };
}

function runR1Scheduled() { return runScheduledFlowWorker_('R1'); }
function runR2Scheduled() { return runScheduledFlowWorker_('R2'); }
function runR3Scheduled() { return runScheduledFlowWorker_('R3'); }
function runR4Scheduled() { return runScheduledFlowWorker_('R4'); }
function runR5Scheduled() { return runScheduledFlowWorker_('R5'); }
function runR6Scheduled() { return runScheduledFlowWorker_('R6'); }
function runR7Scheduled() { return runScheduledFlowWorker_('R7'); }
function runR8Scheduled() { return runScheduledFlowWorker_('R8'); }

function runR0DailySummary() {
  const worker = runScheduledFlowWorker_('R0');
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
    evidenceRef: worker.runId,
    result: 'RECORDED',
    notes: 'Aggregation only; no gate decision is auto-approved.'
  });
  return Object.assign({}, worker, {
    openDecisionCount: openDecisions.length,
    openTaskCount: openTasks.length,
    blockerCount: blockers.length
  });
}
