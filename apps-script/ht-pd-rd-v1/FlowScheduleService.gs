function readFlowSchedule_() {
  return readObjects_(RD_CONFIG.SHEETS.FLOW_SCHEDULE)
    .filter(row => String(row.FLOW_ID || '').trim());
}

function normalizedScheduleTime_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, RD_CONFIG.TIME_ZONE, 'HH:mm');
  }
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60);
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) return String(Number(match[1])).padStart(2, '0') + ':' + match[2];
  return text;
}

function validateFlowSchedule_() {
  const rows = readFlowSchedule_();
  const byFlow = Object.fromEntries(rows.map(row => [String(row.FLOW_ID), row]));
  const issues = [];
  ['R1', 'R2', 'R3'].forEach(flowId => {
    const row = byFlow[flowId];
    if (!row) issues.push(flowId + ' missing');
    else if (String(row.DEPENDS_ON || '').trim() !== 'M0:CONFIRMED') issues.push(flowId + ' must depend on M0:CONFIRMED');
  });
  const fanoutTimes = ['R1', 'R2', 'R3']
    .map(flowId => byFlow[flowId] ? normalizedScheduleTime_(byFlow[flowId].START_TIME) : '')
    .filter(Boolean);
  if (new Set(fanoutTimes).size > 1) issues.push('R1/R2/R3 must share the same fan-out start time');
  if (byFlow.R2 && String(byFlow.R2.INPUT_SHEETS || '').includes('04_Market_Research')) issues.push('R2 must not require R1 market output');
  if (byFlow.R3 && String(byFlow.R3.INPUT_SHEETS || '').includes('04_Market_Research')) issues.push('R3 must not require R1 market output');
  if (byFlow.R4 && String(byFlow.R4.DEPENDS_ON || '') !== 'R1|R2|R3') issues.push('R4 must depend on all R1|R2|R3');
  return { ok: issues.length === 0, issues, fanoutTime: fanoutTimes[0] || '' };
}

function handlerExists_(handlerName) {
  try {
    return typeof globalThis[handlerName] === 'function';
  } catch (error) {
    return false;
  }
}

function parseScheduleHourMinute_(value) {
  const normalized = normalizedScheduleTime_(value);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error('START_TIME không hợp lệ: ' + normalized);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function triggerRuntimeSnapshot_() {
  const projectTriggers = ScriptApp.getProjectTriggers();
  const triggers = projectTriggers.map(trigger => ({
    handler: trigger.getHandlerFunction(),
    triggerId: trigger.getUniqueId(),
    eventType: String(trigger.getEventType()),
    source: String(trigger.getTriggerSource())
  }));
  const schedule = readFlowSchedule_();
  const expected = schedule.filter(row => String(row.ENABLED).toUpperCase() === 'TRUE');
  const missing = expected.filter(row => !triggers.some(t => t.handler === String(row.HANDLER))).map(row => String(row.FLOW_ID));
  return {
    installed: missing.length === 0 && expected.length > 0,
    expectedHandlers: expected.map(row => String(row.HANDLER)),
    missingFlows: missing,
    triggers
  };
}

function syncFlowTriggerStatusFromRuntime() {
  const actor = requireTechnicalOperator_();
  const snapshot = triggerRuntimeSnapshot_();
  const schedule = readFlowSchedule_();
  schedule.forEach(row => {
    const flowId = String(row.FLOW_ID || '');
    const handler = String(row.HANDLER || '');
    const match = snapshot.triggers.find(t => t.handler === handler);
    updateObjectById_(RD_CONFIG.SHEETS.FLOW_SCHEDULE, 'FLOW_ID', flowId, {
      TRIGGER_STATUS: match ? 'INSTALLED' : 'PENDING_INSTALL',
      NOTES: match
        ? truncate_(String(row.NOTES || '') + ' | triggerId=' + match.triggerId, 45000)
        : String(row.NOTES || '')
    });
  });
  appendAudit_({
    actor,
    action: 'SYNC_FLOW_TRIGGER_STATUS_FROM_RUNTIME',
    entityType: 'APPS_SCRIPT',
    entityId: RD_CONFIG.PROJECT_CODE,
    beforeState: 'SHEET_STATUS_ONLY',
    afterState: snapshot.installed ? 'ALL_ENABLED_TRIGGERS_INSTALLED' : 'TRIGGERS_INCOMPLETE',
    evidenceRef: snapshot.triggers.map(t => t.triggerId).join('|'),
    result: snapshot.installed ? 'RECORDED' : 'NEEDS_ACTION',
    notes: JSON.stringify(snapshot)
  });
  return snapshot;
}

function installRdTriggersFromMenu() {
  const actor = requireTechnicalOperator_();
  if (RD_CONFIG.ENVIRONMENT !== 'UAT') throw new Error('Cài trigger tự động hiện chỉ được phép ở UAT.');
  const scheduleValidation = validateFlowSchedule_();
  if (!scheduleValidation.ok) throw new Error('95_Flow_Schedule chưa hợp lệ: ' + scheduleValidation.issues.join('; '));

  const rows = readFlowSchedule_().filter(row => String(row.ENABLED).toUpperCase() === 'TRUE');
  const missingHandlers = rows.filter(row => !handlerExists_(String(row.HANDLER || ''))).map(row => String(row.HANDLER || ''));
  if (missingHandlers.length) throw new Error('Chưa đủ handler runtime; không cài trigger: ' + missingHandlers.join(', '));

  const knownHandlers = new Set(rows.map(row => String(row.HANDLER || '')));
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (knownHandlers.has(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });

  const created = [];
  rows.forEach(row => {
    const time = parseScheduleHourMinute_(row.START_TIME);
    const trigger = ScriptApp.newTrigger(String(row.HANDLER))
      .timeBased()
      .atHour(time.hour)
      .nearMinute(time.minute)
      .everyDays(1)
      .inTimezone(RD_CONFIG.TIME_ZONE)
      .create();
    created.push({ flowId: String(row.FLOW_ID), handler: String(row.HANDLER), triggerId: trigger.getUniqueId(), time: normalizedScheduleTime_(row.START_TIME) });
  });
  PropertiesService.getScriptProperties().setProperty('RD_FLOW_SCHEDULE_INSTALLED_BY', actor.email + '|' + nowIso_());
  SpreadsheetApp.flush();
  const snapshot = syncFlowTriggerStatusFromRuntime();
  if (!snapshot.installed) throw new Error('Trigger creation postcondition failed: ' + JSON.stringify(snapshot));
  appendAudit_({
    actor,
    action: 'INSTALL_RD_FLOW_TRIGGERS_UAT',
    entityType: 'APPS_SCRIPT',
    entityId: RD_CONFIG.PROJECT_CODE,
    beforeState: 'PENDING_INSTALL',
    afterState: 'INSTALLED',
    evidenceRef: created.map(item => item.triggerId).join('|'),
    result: 'RECORDED',
    notes: JSON.stringify(created)
  });
  return { ok: true, created, snapshot };
}
