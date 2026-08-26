function uatCheck_(name, fn, results) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail == null ? '' : detail });
    return detail;
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    return null;
  }
}

function uatExpectThrow_(fn, expectedText) {
  let thrown = null;
  try { fn(); } catch (error) { thrown = error; }
  if (!thrown) throw new Error('Expected operation to fail closed, but it succeeded.');
  if (expectedText && !String(thrown.message || '').includes(expectedText)) {
    throw new Error('Unexpected rejection: ' + thrown.message);
  }
  return thrown.message;
}

function appendBackendUatRunLog_(input) {
  const runId = 'RUN-BACKEND-UAT-' + todayKey_() + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendObject_(RD_CONFIG.SHEETS.FLOW_RUN_LOG, {
    RUN_ID: runId,
    FLOW_ID: 'BACKEND_UAT_GATE',
    RD_CASE_ID: input.rdCaseId || '',
    SCHEDULED_FOR: '',
    TRIGGER_ID: '',
    STARTED_AT: input.startedAt,
    FINISHED_AT: nowIso_(),
    EXECUTION_MODE: 'APPS_SCRIPT_UAT_RUNTIME',
    ATTEMPT: 1,
    LEASE_STATUS: 'NOT_REQUIRED',
    DEPENDENCY_STATUS: input.ok ? 'PASS' : 'FAILED',
    API_STATUS: 'NOT_REQUIRED_FOR_TEST_HARNESS',
    REPORT_ID: '',
    RECORDS_IMPORTED: Number(input.passCount || 0),
    NEXT_FLOW: input.ok ? 'BACKEND_READY_REVIEW' : 'FIX_P0',
    RUN_STATUS: input.ok ? 'PASS' : 'FAIL',
    ERROR_CODE: input.ok ? '' : 'BACKEND_UAT_TEST_FAILURE',
    ERROR_MESSAGE: input.ok ? '' : truncate_(JSON.stringify(input.failures || []), 45000),
    AUDIT_ID: input.auditId || '',
    NOTES: truncate_(JSON.stringify({ sourceVersion: RD_CANONICAL.SOURCE_VERSION, results: input.results }), 45000)
  });
  return runId;
}

/**
 * Destructive-in-the-UAT-sense: creates isolated UAT request/case, decisions,
 * market fixtures, candidate records, audit rows and run-log evidence.
 * It never deletes history and never writes Product Master/CRM/WordPress.
 */
function runBackendUatGateTests() {
  const actor = requireTechnicalOperator_();
  if (RD_CONFIG.ENVIRONMENT !== 'UAT') throw new Error('Backend UAT tests chỉ được chạy trong UAT.');
  const startedAt = nowIso_();
  const token = Utilities.formatDate(new Date(), RD_CONFIG.TIME_ZONE, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const results = [];
  const state = { requestId: '', caseId: '', priorityOpenDecisionId: '', priorityResultDecisionId: '', marketRunId: '' };

  uatCheck_('permission matrix ht/gpt/youtube1/unknown fail-closed', () => {
    const ht = getActorContextForEmail_('ht@hatiencorp.vn');
    const gpt = getActorContextForEmail_('gpt@hatiencorp.vn');
    const mkt = getActorContextForEmail_('youtube1@hatiencorp.vn');
    const unknown = getActorContextForEmail_('unknown-uat@hatiencorp.vn');
    if (!ht.allowed || !ht.permissions.setPriority || !ht.permissions.finalApprove) throw new Error('ht permission mismatch');
    if (!gpt.allowed || !gpt.permissions.technicalOperate || !gpt.permissions.approveGate || !gpt.uatHaiProxy) throw new Error('gpt UAT permission mismatch');
    if (!mkt.allowed || !mkt.permissions.createRequest || mkt.permissions.setPriority || mkt.permissions.approveGate) throw new Error('youtube1 permission mismatch');
    if (unknown.allowed) throw new Error('unknown user did not fail closed');
    return 'PASS';
  }, results);

  uatCheck_('95_Flow_Schedule R1/R2/R3 M0 parallel fan-out', () => {
    const validation = validateFlowSchedule_();
    if (!validation.ok) throw new Error(validation.issues.join('; '));
    return validation;
  }, results);

  uatCheck_('create request', () => {
    const created = createRdRequest({
      requestTitle: 'UAT BACKEND P0 ' + token,
      targetProduct: RD_CONFIG.PRIORITY_PRODUCT_SCOPE,
      requestKind: 'IMPROVEMENT',
      targetMarket: 'VN',
      targetCustomer: 'UAT_TEST',
      customerPain: 'UAT_TEST',
      targetOutcomes: 'UAT_TEST',
      constraints: 'UAT_TEST',
      sourceType: 'UAT_RUNTIME_TEST',
      sourceRef: 'UAT:' + token,
      notes: 'Isolated backend UAT fixture.'
    });
    state.requestId = created.requestId;
    return created;
  }, results);

  uatCheck_('set priority append-only decision chain', () => {
    if (!state.requestId) throw new Error('request fixture missing');
    const open = latestOpenDecision_({ decisionType: 'WORK_PRIORITY_SELECTION', decisionScope: state.requestId });
    if (!open) throw new Error('priority open decision missing');
    state.priorityOpenDecisionId = String(open.DECISION_ID);
    const result = setRequestPriority(state.requestId, 'P2', 'UAT runtime priority test');
    state.priorityResultDecisionId = String(result.decisionId || '');
    const recorded = findObjectById_(RD_CONFIG.SHEETS.DECISIONS, 'DECISION_ID', state.priorityResultDecisionId);
    if (!recorded || String(recorded.record.PREVIOUS_DECISION_ID || '') !== state.priorityOpenDecisionId) {
      throw new Error('decision append-only chain missing');
    }
    const original = findObjectById_(RD_CONFIG.SHEETS.DECISIONS, 'DECISION_ID', state.priorityOpenDecisionId);
    if (!original || String(original.record.STATUS || '') !== 'OPEN') throw new Error('original open decision was mutated');
    return { open: state.priorityOpenDecisionId, result: state.priorityResultDecisionId };
  }, results);

  uatCheck_('research approval creates case', () => {
    if (!state.requestId) throw new Error('request fixture missing');
    const result = approveResearch(state.requestId, 'RESEARCH_APPROVED', 'UAT runtime research gate');
    state.caseId = String(result.caseId || '');
    if (!state.caseId) throw new Error('case not created');
    return result;
  }, results);

  uatCheck_('M0 confirmation releases R1/R2/R3 simultaneously', () => {
    if (!state.caseId) throw new Error('case fixture missing');
    const open = latestOpenDecision_({ rdCaseId: state.caseId, decisionType: 'M0_INPUT_CONFIRMATION' });
    if (!open) throw new Error('M0 decision missing');
    resolveOpenDecision({ decisionId: open.DECISION_ID, decision: 'CONFIRMED_M0', reason: 'UAT runtime M0 fan-out test' });
    const tasks = readObjects_(RD_CONFIG.SHEETS.TASKS).filter(row => String(row.RD_CASE_ID) === state.caseId);
    ['R1.1', 'R2.1', 'R3.1'].forEach(subflowId => {
      const task = tasks.find(row => String(row.SUBFLOW_ID) === subflowId);
      if (!task) throw new Error(subflowId + ' missing');
      if (String(task.DEPENDS_ON) !== 'M0:CONFIRMED') throw new Error(subflowId + ' dependency drift');
      if (String(task.STATUS) !== 'READY') throw new Error(subflowId + ' not READY after M0');
    });
    return 'R1/R2/R3 READY';
  }, results);

  uatCheck_('M4 weak-evidence positive decision rejected', () => {
    return uatExpectThrow_(() => submitGateDecision({
      gateType: 'M4_GATE', rdCaseId: state.caseId, decision: 'GO_CONCEPT', reason: 'UAT must reject weak evidence'
    }), 'Chưa đủ bằng chứng');
  }, results);

  uatCheck_('final handover rejected without full evidence', () => {
    return uatExpectThrow_(() => submitGateDecision({
      gateType: 'FINAL_HANDOVER', rdCaseId: state.caseId,
      decision: 'APPROVED_FOR_PRODUCT_MASTER_REVIEW', reason: 'UAT must reject incomplete handover'
    }), 'Chưa đủ bằng chứng');
  }, results);

  uatCheck_('MARKET_SIGNAL→RD_CANDIDATE provenance + dedup + run log', () => {
    const signalBase = {
      RD_CASE_ID: state.caseId,
      GATE: 'UAT',
      RESEARCH_TOPIC: 'UAT candidate dedup ' + token,
      MARKET: 'VN',
      SEGMENT: 'UAT_TEST',
      SIGNAL_TYPE: 'UAT_MARKET_SIGNAL',
      SOURCE_TITLE: 'UAT deterministic provenance fixture',
      SOURCE_ORGANIZATION: 'HT-PD-RD UAT',
      PUBLISHED_DATE: '',
      ACCESSED_AT: nowIso_(),
      EXTRACT: 'UAT dedup signal ' + token,
      EVIDENCE_LABEL: 'BẢN NHÁP/LỊCH SỬ',
      CONFIDENCE: 'UAT_ONLY',
      ENTERED_BY: actor.email,
      STATUS: 'UAT_TEST_FIXTURE',
      NEXT_ACTION: 'Candidate dedup test only; not market fact.'
    };
    const mr1 = nextId_('MR');
    const mr2 = nextId_('MR');
    appendObject_(RD_CONFIG.SHEETS.MARKET_RESEARCH, Object.assign({}, signalBase, { MARKET_EVIDENCE_ID: mr1, SOURCE_URL_OR_FILE: 'uat://market-signal/' + token + '/1' }));
    appendObject_(RD_CONFIG.SHEETS.MARKET_RESEARCH, Object.assign({}, signalBase, { MARKET_EVIDENCE_ID: mr2, SOURCE_URL_OR_FILE: 'uat://market-signal/' + token + '/2' }));
    const cycle = runMarketScoutCandidateCycleUat();
    state.marketRunId = String(cycle.runId || '');
    const candidates = readObjects_(candidateSheetName_()).filter(row => String(row.SOURCE_SIGNAL_IDS || '').includes(mr1) || String(row.SOURCE_SIGNAL_IDS || '').includes(mr2));
    if (candidates.length !== 1) throw new Error('candidate dedup expected 1, got ' + candidates.length);
    const candidate = candidates[0];
    if (!String(candidate.SOURCE_SIGNAL_IDS || '').includes(mr1) || !String(candidate.SOURCE_SIGNAL_IDS || '').includes(mr2)) throw new Error('source signal traceability missing');
    const provenance = parseJson_(candidate.PROVENANCE_JSON, []);
    if (!Array.isArray(provenance) || provenance.length < 2) throw new Error('provenance merge missing');
    const run = findObjectById_(RD_CONFIG.SHEETS.FLOW_RUN_LOG, 'RUN_ID', state.marketRunId);
    if (!run || String(run.record.RUN_STATUS) !== 'COMPLETED') throw new Error('Market Scout run log missing');
    return { candidateId: candidate.RD_CANDIDATE_ID, runId: state.marketRunId, mr1, mr2 };
  }, results);

  uatCheck_('decision and audit generic updates are blocked', () => {
    if (!state.priorityResultDecisionId) throw new Error('decision fixture missing');
    uatExpectThrow_(() => updateObjectById_(RD_CONFIG.SHEETS.DECISIONS, 'DECISION_ID', state.priorityResultDecisionId, { STATUS: 'MUTATED' }), 'append-only');
    const audit = readObjects_(RD_CONFIG.SHEETS.AUDIT).slice(-1)[0];
    if (!audit) throw new Error('audit fixture missing');
    uatExpectThrow_(() => updateObjectById_(RD_CONFIG.SHEETS.AUDIT, 'AUDIT_ID', audit.AUDIT_ID, { RESULT: 'MUTATED' }), 'append-only');
    return 'PASS';
  }, results);

  uatCheck_('audit IDs globally unique after writes', () => assertNoDuplicateIds_(), results);

  uatCheck_('decision/audit evidence traceability', () => {
    const decisionAudit = readObjects_(RD_CONFIG.SHEETS.AUDIT).filter(row => String(row.ENTITY_ID || '') === state.requestId || String(row.ENTITY_ID || '') === state.caseId);
    if (!decisionAudit.some(row => String(row.EVIDENCE_REF || '').trim())) throw new Error('no evidence-ref audit for fixture');
    if (!findObjectById_(RD_CONFIG.SHEETS.DECISIONS, 'DECISION_ID', state.priorityResultDecisionId)) throw new Error('decision result not traceable');
    return decisionAudit.map(row => row.AUDIT_ID).join('|');
  }, results);

  const failures = results.filter(item => !item.ok);
  const summaryAuditId = appendAudit_({
    actor,
    action: 'BACKEND_UAT_GATE_TESTS',
    entityType: 'RD_CASE',
    entityId: state.caseId || state.requestId || RD_CONFIG.PROJECT_CODE,
    beforeState: 'P0_BACKEND_UNVERIFIED',
    afterState: failures.length ? 'P0_BACKEND_TESTS_FAILED' : 'P0_BACKEND_BEHAVIOR_PASS',
    evidenceRef: state.marketRunId || '',
    result: failures.length ? 'ERROR' : 'RECORDED',
    notes: JSON.stringify({ sourceVersion: RD_CANONICAL.SOURCE_VERSION, results })
  });
  const runId = appendBackendUatRunLog_({
    startedAt,
    rdCaseId: state.caseId,
    ok: failures.length === 0,
    passCount: results.length - failures.length,
    failures,
    auditId: summaryAuditId,
    results
  });
  return {
    ok: failures.length === 0,
    backendReadyBehavioral: failures.length === 0,
    runId,
    auditId: summaryAuditId,
    sourceVersion: RD_CANONICAL.SOURCE_VERSION,
    requestId: state.requestId,
    caseId: state.caseId,
    marketRunId: state.marketRunId,
    results,
    failures,
    note: 'Behavioral PASS alone is not BACKEND_READY until runtime prerequisites + canonical deploy/source hash evidence also pass.'
  };
}
