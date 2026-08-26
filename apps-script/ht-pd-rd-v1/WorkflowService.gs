const RD_FLOW_DEPENDENCIES = Object.freeze({
  'R0.1': '', 'R0.2': 'R0.1', 'R0.3': 'R0.2', 'R0.4': 'R0.2', 'R0.5': 'R0.4', 'R0.6': 'R0.4', 'R0.7': 'R0.4',
  // R1/R2/R3 entry tasks are released together only after M0 is confirmed.
  'R1.1': 'M0:CONFIRMED', 'R1.2': 'R1.1', 'R1.3': 'R1.1', 'R1.4': 'R1.2|R1.3', 'R1.6': 'R1.1', 'R1.5': 'R1.4|R1.6',
  'R2.1': 'M0:CONFIRMED', 'R2.2': 'R2.1', 'R2.3': 'R2.1', 'R2.4': 'R2.2|R2.3', 'R2.5': 'R2.4', 'R2.6': 'R2.5',
  'R3.1': 'M0:CONFIRMED', 'R3.2': 'R3.1', 'R3.3': 'R3.2', 'R3.4': 'R3.3', 'R3.5': 'R3.4', 'R3.6': 'R3.5',
  'R4.1': 'R1.5|R2.6|R3.6|GATE:M4', 'R4.2': 'R4.1', 'R4.3': 'R4.2', 'R4.4': 'R4.2', 'R4.5': 'R4.2', 'R4.6': 'R4.2', 'R4.7': 'R4.3|R4.4|R4.5|R4.6',
  'R5.1': 'R4.7|GATE:CONCEPT', 'R5.2': 'R5.1', 'R5.3': 'R5.2', 'R5.4': 'R5.1', 'R5.5': 'R5.3|R5.4', 'R5.6': 'R5.5', 'R5.7': 'R5.6',
  'R6.1': 'R4.7|GATE:CONCEPT', 'R6.2': 'R6.1', 'R6.3': 'R6.1', 'R6.4': 'R6.2|R6.3', 'R6.5': 'R6.4', 'R6.6': 'R6.5', 'R6.7': 'R6.6',
  'R7.1': '', 'R7.2': 'R4.2', 'R7.3': 'R5.2', 'R7.4': 'R5.5', 'R7.5': 'R6.6', 'R7.6': 'R7.2|R7.3|R7.4|R7.5', 'R7.7': 'R5.7|R6.7|R7.6',
  'R8.1': 'R5.7|R6.7|R7.7|GATE:QA', 'R8.2': 'R8.1', 'R8.3': 'R8.2', 'R8.4': 'R8.3', 'R8.5': 'R8.4', 'R8.6': 'R8.5', 'R8.7': 'R8.6', 'R8.8': 'R8.7'
});

const RD_FLOW_OUTPUT_SHEETS = Object.freeze({
  R0: '16_Tasks_Blockers', R1: '04_Market_Research', R2: '05_VOC_UseCases', R3: '06_Competitor_Benchmark',
  R4: '08_Concepts_Revisions', R5: '11_Test_Results', R6: '13_BOM_DFM_Cost', R7: '14_Claims_Proof', R8: '18_Pilot_Feedback'
});

function flowOwner_(flowId) {
  return ['R0', 'R1', 'R2', 'R3', 'R7'].includes(flowId) ? 'gpt@hatiencorp.vn' : 'UNASSIGNED';
}

function flowTaskType_(flowId) {
  return ({ R0: 'CONTROL', R1: 'RESEARCH', R2: 'RESEARCH', R3: 'RESEARCH', R4: 'ENGINEERING', R5: 'TEST', R6: 'DFM', R7: 'QA', R8: 'PILOT' })[flowId] || 'TASK';
}

function initialTaskStatus_(subflowId, priorityStatus) {
  if (['R0.1', 'R0.2'].includes(subflowId)) return 'CLOSED_WITH_EVIDENCE';
  if (subflowId === 'R0.3') return priorityStatus === 'CONFIRMED_BY_HAI' ? 'CLOSED_WITH_EVIDENCE' : 'WAITING_AUTHORIZED_APPROVAL';
  if (['R0.4', 'R0.5', 'R0.6', 'R0.7'].includes(subflowId)) return 'READY';
  if (['R1.1', 'R2.1', 'R3.1'].includes(subflowId)) return 'WAITING_DEPENDENCY';
  if (subflowId === 'R7.1') return 'READY_MONITORING';
  return 'WAITING_DEPENDENCY';
}

function spawnCaseTasks_(caseId, request, actor) {
  const existing = readObjects_(RD_CONFIG.SHEETS.TASKS).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const existingSubflows = new Set(existing.map(row => String(row.SUBFLOW_ID || '')).filter(Boolean));
  const registry = readObjects_(RD_CONFIG.SHEETS.FLOW_REGISTRY);
  const created = [];
  registry.forEach(row => {
    const flowId = String(row.FLOW_ID || '').trim();
    const subflowId = String(row.SUBFLOW_ID || '').trim();
    if (!flowId || !subflowId || existingSubflows.has(subflowId)) return;
    const status = initialTaskStatus_(subflowId, request.PRIORITY_STATUS);
    const taskId = nextId_('RDT');
    appendObject_(RD_CONFIG.SHEETS.TASKS, {
      TASK_ID: taskId, RD_CASE_ID: caseId, FLOW_ID: flowId, SUBFLOW_ID: subflowId,
      TASK_TITLE: row.SUBFLOW_NAME || row.PURPOSE || subflowId, TASK_TYPE: flowTaskType_(flowId), OWNER: flowOwner_(flowId),
      DUE_DATE: '', PRIORITY: request.WORK_PRIORITY || '', STATUS: status,
      DEPENDS_ON: RD_FLOW_DEPENDENCIES[subflowId] || '',
      BLOCKER_REASON: status === 'WAITING_DEPENDENCY' ? 'Chờ dependency.' : '',
      OUTPUT_SHEET: RD_FLOW_OUTPUT_SHEETS[flowId] || '',
      GATE_REQUIRED: ['R1.5', 'R2.6', 'R3.6', 'R4.7', 'R5.7', 'R6.7', 'R7.7', 'R8.7', 'R8.8'].includes(subflowId) ? 'YES' : 'NO',
      CREATED_AT: nowIso_(), UPDATED_AT: nowIso_(), NOTES: ''
    });
    created.push({ taskId, subflowId, status });
  });
  appendAudit_({ actor, action: 'SPAWN_CASE_TASKS', entityType: 'RD_CASE', entityId: caseId,
    beforeState: String(existing.length), afterState: String(existing.length + created.length), evidenceRef: request.RD_REQUEST_ID,
    result: 'RECORDED', notes: JSON.stringify({ created }) });
  return created;
}

function releaseResearchFanoutAfterM0_(caseId, actor) {
  const entries = new Set(['R1.1', 'R2.1', 'R3.1']);
  const changed = [];
  readObjects_(RD_CONFIG.SHEETS.TASKS)
    .filter(row => String(row.RD_CASE_ID) === String(caseId) && entries.has(String(row.SUBFLOW_ID || '')))
    .forEach(task => {
      if (String(task.STATUS || '') === 'READY') return;
      updateObjectById_(RD_CONFIG.SHEETS.TASKS, 'TASK_ID', task.TASK_ID, {
        STATUS: 'READY', BLOCKER_REASON: '', UPDATED_AT: nowIso_()
      });
      changed.push(task.SUBFLOW_ID);
    });
  updateObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId, {
    CURRENT_STAGE: 'RESEARCH_R1_R2_R3', CASE_STATUS: 'RESEARCH_IN_PROGRESS',
    NEXT_ACTION: 'R1/R2/R3 chạy song song sau M0', NEXT_ACTION_OWNER: 'gpt@hatiencorp.vn'
  });
  appendAudit_({ actor, action: 'RELEASE_R1_R2_R3_FANOUT', entityType: 'RD_CASE', entityId: caseId,
    beforeState: 'M0_IN_PROGRESS', afterState: 'RESEARCH_IN_PROGRESS', evidenceRef: '', result: 'RECORDED', notes: JSON.stringify(changed) });
  return changed;
}

function isCompletedTaskStatus_(status) {
  return ['HANDOFF_READY', 'CLOSED_WITH_EVIDENCE', 'COMPLETED_LIMITED_SCOPE', 'CLOSED_WITH_REVIEW_REQUIRED'].includes(String(status || ''));
}

function gateDependencyMet_(portfolio, token) {
  const gate = String(token || '').replace('GATE:', '');
  if (gate === 'M4') return String(portfolio.M4_DECISION) === 'GO_CONCEPT';
  if (gate === 'CONCEPT') return String(portfolio.CONCEPT_GATE) === 'GATE_APPROVED';
  if (gate === 'TECHNICAL') return String(portfolio.TECHNICAL_GATE) === 'GATE_APPROVED';
  if (gate === 'DFM') return String(portfolio.DFM_GATE) === 'GATE_APPROVED';
  if (gate === 'QA') return String(portfolio.QA_GATE) === 'GATE_APPROVED';
  if (gate === 'PILOT') return String(portfolio.PILOT_GATE) === 'GATE_APPROVED';
  return false;
}

function dependencyMet_(token, tasksBySubflow, portfolio) {
  token = String(token || '').trim();
  if (!token) return true;
  if (token === 'M0:CONFIRMED') return false; // released only by explicit M0 decision handler.
  if (token.startsWith('GATE:')) return gateDependencyMet_(portfolio, token);
  const task = tasksBySubflow[token];
  return Boolean(task && isCompletedTaskStatus_(task.STATUS));
}

function reconcileDependencies_(caseId, actor) {
  const portfolioFound = findObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId);
  if (!portfolioFound) throw new Error('Không tìm thấy case: ' + caseId);
  const tasks = readObjects_(RD_CONFIG.SHEETS.TASKS).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const tasksBySubflow = Object.fromEntries(tasks.map(row => [String(row.SUBFLOW_ID || ''), row]));
  const changes = [];
  tasks.forEach(task => {
    const current = String(task.STATUS || '');
    if (!['WAITING_DEPENDENCY', 'BLOCKED'].includes(current)) return;
    const dependencies = String(task.DEPENDS_ON || '').split('|').map(v => v.trim()).filter(Boolean);
    if (dependencies.includes('M0:CONFIRMED')) return;
    const ready = dependencies.every(token => dependencyMet_(token, tasksBySubflow, portfolioFound.record));
    if (!ready) return;
    updateObjectById_(RD_CONFIG.SHEETS.TASKS, 'TASK_ID', task.TASK_ID, { STATUS: 'READY', BLOCKER_REASON: '', UPDATED_AT: nowIso_() });
    changes.push({ taskId: task.TASK_ID, from: current, to: 'READY' });
  });
  if (changes.length) appendAudit_({ actor, action: 'RECONCILE_DEPENDENCIES', entityType: 'RD_CASE', entityId: caseId,
    beforeState: 'WAITING_DEPENDENCY', afterState: 'READY', evidenceRef: '', result: 'RECORDED', notes: JSON.stringify(changes) });
  return changes;
}

function listMyTasks_(email) {
  return readObjects_(RD_CONFIG.SHEETS.TASKS)
    .filter(row => {
      const owner = String(row.OWNER || '');
      const open = !isCompletedTaskStatus_(row.STATUS) && String(row.STATUS || '') !== 'STOPPED';
      return open && (owner === email || owner === 'UNASSIGNED' || email === RD_CONFIG.FINAL_APPROVER);
    }).slice(-150).reverse();
}

const RD_GATE_DEFINITIONS = Object.freeze({
  M4_GATE: Object.freeze({ permission: 'approveGate', allowed: Object.freeze(['GO_CONCEPT', 'RESEARCH_MORE', 'HOLD', 'STOP']), portfolioField: 'M4_DECISION' }),
  CONCEPT_GATE: Object.freeze({ permission: 'approveGate', allowed: Object.freeze(['GATE_APPROVED', 'GATE_NEED_MORE_EVIDENCE', 'GATE_HOLD_RECOMMENDED', 'GATE_REJECTED']), portfolioField: 'CONCEPT_GATE' }),
  TECHNICAL_GATE: Object.freeze({ permission: 'approveGate', allowed: Object.freeze(['GATE_APPROVED', 'GATE_NEED_MORE_EVIDENCE', 'GATE_HOLD_RECOMMENDED', 'GATE_REJECTED']), portfolioField: 'TECHNICAL_GATE' }),
  DFM_GATE: Object.freeze({ permission: 'approveGate', allowed: Object.freeze(['GATE_APPROVED', 'GATE_NEED_MORE_EVIDENCE', 'GATE_HOLD_RECOMMENDED', 'GATE_REJECTED']), portfolioField: 'DFM_GATE' }),
  QA_GATE: Object.freeze({ permission: 'approveGate', allowed: Object.freeze(['GATE_APPROVED', 'GATE_NEED_MORE_EVIDENCE', 'GATE_HOLD_RECOMMENDED', 'GATE_REJECTED']), portfolioField: 'QA_GATE' }),
  PILOT_GATE: Object.freeze({ permission: 'approveGate', allowed: Object.freeze(['GATE_APPROVED', 'GATE_NEED_MORE_EVIDENCE', 'GATE_HOLD_RECOMMENDED', 'GATE_REJECTED']), portfolioField: 'PILOT_GATE' }),
  FINAL_HANDOVER: Object.freeze({ permission: 'finalApprove', allowed: Object.freeze(['APPROVED_FOR_PRODUCT_MASTER_REVIEW', 'GATE_NEED_MORE_EVIDENCE', 'GATE_REJECTED']), portfolioField: 'FINAL_HANDOVER' })
});

function normalizedGateText_(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
function hasTraceableSource_(row) { return Boolean(String(row.SOURCE_URL_OR_FILE || row.SOURCE_URL || row.SOURCE_REF || row.DRIVE_URL || row.DRIVE_FILE_ID || '').trim()); }
function isVerifiedEvidenceLabel_(value) { return String(value || '').trim() === 'ĐÃ XÁC MINH'; }
function isOwnerSuppliedEvidenceLabel_(value) { return String(value || '').trim() === 'HẢI CUNG CẤP - CHỜ KIỂM CHỨNG'; }
function hasVerifiedEvidenceForCase_(rows) { return rows.some(row => isVerifiedEvidenceLabel_(row.EVIDENCE_LABEL) && hasTraceableSource_(row)); }

function gateCoverage_(caseId, gateType) {
  const caseFound = findObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId);
  if (!caseFound) throw new Error('Không tìm thấy case: ' + caseId);
  const portfolio = caseFound.record;
  const evidence = readObjects_(RD_CONFIG.SHEETS.EVIDENCE).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const market = readObjects_(RD_CONFIG.SHEETS.MARKET_RESEARCH).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const voc = readObjects_(RD_CONFIG.SHEETS.VOC).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const benchmark = readObjects_(RD_CONFIG.SHEETS.BENCHMARK).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const concepts = readObjects_(RD_CONFIG.SHEETS.CONCEPTS).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const tests = readObjects_(RD_CONFIG.SHEETS.TEST_RESULTS).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const bom = readObjects_(RD_CONFIG.SHEETS.BOM_DFM).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const claims = readObjects_(RD_CONFIG.SHEETS.CLAIMS).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const pilots = readObjects_(RD_CONFIG.SHEETS.PILOT).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const tasks = readObjects_(RD_CONFIG.SHEETS.TASKS).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const bySubflow = Object.fromEntries(tasks.map(row => [String(row.SUBFLOW_ID || ''), row]));

  const verifiedMarket = market.filter(row => isVerifiedEvidenceLabel_(row.EVIDENCE_LABEL) && hasTraceableSource_(row));
  const trustedVoc = voc.filter(row => String(row.VOC_VERBATIM || '').trim() && String(row.SOURCE_REF || '').trim() && (isVerifiedEvidenceLabel_(row.EVIDENCE_LABEL) || isOwnerSuppliedEvidenceLabel_(row.EVIDENCE_LABEL)));
  const verifiedBenchmark = benchmark.filter(row => String(row.MODEL || row.BRAND || '').trim() && String(row.SOURCE_URL || '').trim() && isVerifiedEvidenceLabel_(row.EVIDENCE_LABEL));
  const traceableTests = tests.filter(row => String(row.REVISION_ID || '').trim() && String(row.TEST_RUN_ID || '').trim() && String(row.EVIDENCE_IDS || '').trim() && String(row.RESULT_ASSESSMENT || '').trim());
  const dfmEvidence = bom.filter(row => String(row.REVISION_ID || '').trim() && String(row.DFM_STATUS || '').trim() && normalizedGateText_(row.DFM_STATUS) !== 'CHƯA BIẾT' && String(row.SOURCE_REF || '').trim());
  const approvedClaims = claims.filter(row => normalizedGateText_(row.R7_STATUS) === 'GATE_APPROVED' && String(row.EVIDENCE_IDS || '').trim());
  const pilotReady = pilots.filter(row => String(row.REVISION_ID || '').trim() && String(row.MEASURED_OUTCOMES || '').trim() && ['READY_FOR_REVIEW', 'READY_FOR_APPROVAL', 'PASS', 'APPROVED', 'GATE_APPROVED'].includes(normalizedGateText_(row.PILOT_STATUS)));
  const p0p1Blockers = tasks.filter(row => ['P0', 'P1'].includes(normalizedGateText_(row.PRIORITY)) && ['BLOCKED', 'WAITING_INPUT'].includes(normalizedGateText_(row.STATUS)));
  const approvedConcepts = concepts.filter(row => String(row.REVISION_ID || '').trim() && normalizedGateText_(row.GATE_DECISION) === 'GATE_APPROVED');
  const researchComplete = ['R1.5', 'R2.6', 'R3.6'].every(id => bySubflow[id] && isCompletedTaskStatus_(bySubflow[id].STATUS));

  const checks = [];
  if (gateType === 'M4_GATE') {
    checks.push({ name: 'R1/R2/R3 đã hoàn tất đầu ra bắt buộc', ok: researchComplete });
    checks.push({ name: 'Market evidence đã xác minh', ok: verifiedMarket.length > 0 });
    checks.push({ name: 'VOC / problem brief có nguồn', ok: trustedVoc.length > 0 });
    checks.push({ name: 'Benchmark >= 3 model có nguồn đã xác minh', ok: verifiedBenchmark.length >= 3 });
    checks.push({ name: 'Không còn blocker P0/P1 dữ liệu', ok: p0p1Blockers.length === 0 });
  } else if (gateType === 'CONCEPT_GATE') {
    checks.push({ name: 'Concept revision có nội dung', ok: concepts.some(row => String(row.REVISION_ID || '').trim() && String(row.CONCEPT_SUMMARY || '').trim()) });
  } else if (gateType === 'TECHNICAL_GATE') {
    checks.push({ name: 'Test result truy xuất được', ok: traceableTests.length > 0 });
    checks.push({ name: 'Evidence đã xác minh', ok: hasVerifiedEvidenceForCase_(evidence) });
  } else if (gateType === 'DFM_GATE') {
    checks.push({ name: 'BOM / DFM có nguồn và trạng thái', ok: dfmEvidence.length > 0 });
  } else if (gateType === 'QA_GATE') {
    checks.push({ name: 'Claim R7 đã duyệt và có evidence', ok: approvedClaims.length > 0 });
    checks.push({ name: 'Evidence đã xác minh', ok: hasVerifiedEvidenceForCase_(evidence) });
  } else if (gateType === 'PILOT_GATE') {
    checks.push({ name: 'Pilot có measured outcomes', ok: pilotReady.length > 0 });
  } else if (gateType === 'FINAL_HANDOVER') {
    checks.push({ name: 'Concept gate approved', ok: normalizedGateText_(portfolio.CONCEPT_GATE) === 'GATE_APPROVED' });
    checks.push({ name: 'Technical gate approved', ok: normalizedGateText_(portfolio.TECHNICAL_GATE) === 'GATE_APPROVED' });
    checks.push({ name: 'DFM gate approved', ok: normalizedGateText_(portfolio.DFM_GATE) === 'GATE_APPROVED' });
    checks.push({ name: 'QA gate approved', ok: normalizedGateText_(portfolio.QA_GATE) === 'GATE_APPROVED' });
    checks.push({ name: 'Pilot gate approved', ok: normalizedGateText_(portfolio.PILOT_GATE) === 'GATE_APPROVED' });
    checks.push({ name: 'Approved concept revision', ok: approvedConcepts.length > 0 });
    checks.push({ name: 'Traceable test result', ok: traceableTests.length > 0 });
    checks.push({ name: 'R7 approved claims', ok: approvedClaims.length > 0 });
    checks.push({ name: 'Pilot measured outcomes', ok: pilotReady.length > 0 });
  }
  return { checks, ready: checks.length > 0 && checks.every(check => check.ok),
    missing: checks.filter(check => !check.ok).map(check => check.name),
    evidenceSummary: { verifiedMarket: verifiedMarket.length, trustedVoc: trustedVoc.length, verifiedBenchmark: verifiedBenchmark.length,
      traceableTests: traceableTests.length, dfmEvidence: dfmEvidence.length, approvedClaims: approvedClaims.length,
      pilotReady: pilotReady.length, p0p1Blockers: p0p1Blockers.length, researchComplete } };
}

function submitGateDecision(payload) {
  payload = payload || {};
  const gateType = String(payload.gateType || '').trim().toUpperCase();
  const definition = RD_GATE_DEFINITIONS[gateType];
  if (!definition) throw new Error('Gate không hỗ trợ: ' + gateType);
  const actor = definition.permission === 'finalApprove' ? requireHai_() : requirePermission_(definition.permission);
  const caseId = String(payload.rdCaseId || '').trim();
  const decision = String(payload.decision || '').trim().toUpperCase();
  assertRequired_(caseId, 'rdCaseId');
  assertIn_(decision, definition.allowed, 'decision');
  const caseFound = findObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId);
  if (!caseFound) throw new Error('Không tìm thấy case: ' + caseId);

  const positive = ['GO_CONCEPT', 'GATE_APPROVED', 'APPROVED_FOR_PRODUCT_MASTER_REVIEW'].includes(decision);
  const coverage = gateCoverage_(caseId, gateType);
  if (positive && !coverage.ready) throw new Error('Chưa đủ bằng chứng cho ' + gateType + ': ' + coverage.missing.join(', '));

  const before = String(caseFound.record[definition.portfolioField] || '');
  const patch = {}; patch[definition.portfolioField] = decision;
  if (gateType === 'M4_GATE' && decision === 'GO_CONCEPT') Object.assign(patch, { CURRENT_STAGE: 'CONCEPT', CASE_STATUS: 'CONCEPT_IN_PROGRESS', NEXT_ACTION: 'R4 — Concept & Engineering' });
  if (gateType === 'CONCEPT_GATE' && decision === 'GATE_APPROVED') Object.assign(patch, { CURRENT_STAGE: 'PROTOTYPE_TEST_DFM', CASE_STATUS: 'PROTOTYPE_TEST_IN_PROGRESS', NEXT_ACTION: 'R5 + R6 chạy song song; R7 kiểm QA' });
  if (gateType === 'QA_GATE' && decision === 'GATE_APPROVED') Object.assign(patch, { CURRENT_STAGE: 'PILOT', CASE_STATUS: 'PILOT_IN_PROGRESS', NEXT_ACTION: 'R8 — Pilot & Feedback' });
  if (gateType === 'FINAL_HANDOVER' && decision === 'APPROVED_FOR_PRODUCT_MASTER_REVIEW') Object.assign(patch, { CURRENT_STAGE: 'HANDOVER', CASE_STATUS: 'HANDOFF_READY', NEXT_ACTION: 'Product Master owner review' });
  updateObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId, patch);

  const decisionId = recordDecisionResult_({
    rdCaseId: caseId, decisionType: gateType, decisionScope: String(payload.scope || gateType), decisionValue: decision,
    actor, evidenceRef: String(payload.evidenceRef || ''), segregationRequired: gateType === 'FINAL_HANDOVER',
    notes: { reason: String(payload.reason || ''), costCap: String(payload.costCap || ''), dueDate: String(payload.dueDate || ''), requiredEvidence: String(payload.requiredEvidence || ''), coverage }
  });
  if (gateType === 'FINAL_HANDOVER' && decision === 'APPROVED_FOR_PRODUCT_MASTER_REVIEW') createHandoverExport_(caseId, actor, decisionId);
  reconcileDependencies_(caseId, actor);
  appendAudit_({ actor, action: 'SUBMIT_GATE_DECISION', entityType: 'RD_CASE', entityId: caseId,
    beforeState: before, afterState: decision, evidenceRef: decisionId, result: 'RECORDED', notes: JSON.stringify({ gateType, coverage }) });
  return { ok: true, caseId, gateType, decision, decisionId, coverage };
}

function splitEvidenceIds_(values) {
  const ids = [];
  values.forEach(value => String(value || '').split(/[|,;\s]+/).forEach(id => { const clean = id.trim(); if (clean && !ids.includes(clean)) ids.push(clean); }));
  return ids;
}

function createHandoverExport_(caseId, actor, decisionId) {
  const existing = readObjects_(RD_CONFIG.SHEETS.HANDOVER)
    .find(row => String(row.RD_CASE_ID) === String(caseId) && String(row.EXPORT_STATUS) === 'READY_FOR_PRODUCT_MASTER_REVIEW');
  if (existing) return existing.HANDOVER_ID;
  const portfolioFound = findObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId);
  if (!portfolioFound) throw new Error('Không tìm thấy case: ' + caseId);
  const portfolio = portfolioFound.record;
  const concepts = readObjects_(RD_CONFIG.SHEETS.CONCEPTS).filter(row => String(row.RD_CASE_ID) === String(caseId));
  const approvedConcept = concepts.filter(row => String(row.REVISION_ID || '').trim() && normalizedGateText_(row.GATE_DECISION) === 'GATE_APPROVED').slice(-1)[0];
  const approvedRevision = approvedConcept ? String(approvedConcept.REVISION_ID || '') : '';
  const traceableTests = readObjects_(RD_CONFIG.SHEETS.TEST_RESULTS).filter(row => String(row.RD_CASE_ID) === String(caseId) && (!approvedRevision || String(row.REVISION_ID || '') === approvedRevision) && String(row.TEST_RUN_ID || '').trim() && String(row.EVIDENCE_IDS || '').trim());
  const claims = readObjects_(RD_CONFIG.SHEETS.CLAIMS).filter(row => String(row.RD_CASE_ID) === String(caseId) && normalizedGateText_(row.R7_STATUS) === 'GATE_APPROVED' && String(row.EVIDENCE_IDS || '').trim());
  const handoverId = nextId_('HND');
  appendObject_(RD_CONFIG.SHEETS.HANDOVER, {
    HANDOVER_ID: handoverId, RD_CASE_ID: caseId, APPROVED_REVISION_ID: approvedRevision,
    PRODUCT_ID: '', PRODUCT_FAMILY_CODE: '', PRODUCT_TYPE_CODE: '', CANONICAL_MODEL: '', MARKET_VARIANT: '', SELLABLE_SKU: '', VERIFIED_SPECIFICATIONS: '',
    TEST_EVIDENCE_IDS: splitEvidenceIds_(traceableTests.map(row => row.EVIDENCE_IDS)).join('|'),
    R7_APPROVED_CLAIMS: claims.map(row => row.CLAIM_ID).filter(Boolean).join('|'),
    BOM_DFM_STATUS: String(portfolio.DFM_GATE || 'NOT_APPROVED'), PILOT_STATUS: String(portfolio.PILOT_GATE || 'NOT_APPROVED'),
    FINAL_APPROVER: actor.email, APPROVED_AT: nowIso_(), EXPORT_STATUS: 'READY_FOR_PRODUCT_MASTER_REVIEW',
    NOTES: 'R&D handover only; không tự tạo Product ID/Model/SKU/Serial/Asset. Decision=' + decisionId
  });
  return handoverId;
}
