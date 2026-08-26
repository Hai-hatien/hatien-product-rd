function appendDecision_(input) {
  input = input || {};
  const decisionId = nextId_('DEC');
  appendObject_(RD_CONFIG.SHEETS.DECISIONS, {
    DECISION_ID: decisionId,
    RD_CASE_ID: input.rdCaseId || '',
    DECISION_TYPE: input.decisionType || '',
    DECISION_SCOPE: input.decisionScope || '',
    DECISION_VALUE: input.decisionValue || '',
    DECIDED_BY: input.actor ? input.actor.email : '',
    DECIDED_AT: input.status === 'OPEN' ? '' : nowIso_(),
    STATUS: input.status || 'RECORDED',
    SEGREGATION_REQUIRED: Boolean(input.segregationRequired),
    EVIDENCE_REF: input.evidenceRef || '',
    PREVIOUS_DECISION_ID: input.previousDecisionId || '',
    NOTES: truncate_(typeof input.notes === 'object' ? JSON.stringify(input.notes) : (input.notes || ''), 45000)
  });
  return decisionId;
}

function latestOpenDecision_(filters) {
  filters = filters || {};
  const decisions = readObjects_(RD_CONFIG.SHEETS.DECISIONS);
  const superseded = new Set(decisions.map(row => String(row.PREVIOUS_DECISION_ID || '').trim()).filter(Boolean));
  return decisions
    .filter(row => String(row.STATUS) === 'OPEN')
    .filter(row => !superseded.has(String(row.DECISION_ID)))
    .filter(row => !filters.rdCaseId || String(row.RD_CASE_ID) === String(filters.rdCaseId))
    .filter(row => !filters.decisionType || String(row.DECISION_TYPE) === String(filters.decisionType))
    .filter(row => !filters.decisionScope || String(row.DECISION_SCOPE) === String(filters.decisionScope))
    .slice(-1)[0] || null;
}

function ensureOpenDecision_(input) {
  input = input || {};
  const existing = latestOpenDecision_({
    rdCaseId: input.rdCaseId || '', decisionType: input.decisionType || '', decisionScope: input.decisionScope || ''
  });
  if (existing) return existing.DECISION_ID;
  return appendDecision_({
    rdCaseId: input.rdCaseId || '', decisionType: input.decisionType || '', decisionScope: input.decisionScope || '',
    decisionValue: '', actor: null, status: 'OPEN', segregationRequired: Boolean(input.segregationRequired),
    evidenceRef: input.evidenceRef || '', notes: input.notes || ''
  });
}

function recordDecisionResult_(input) {
  input = input || {};
  const previous = latestOpenDecision_({
    rdCaseId: input.rdCaseId || '', decisionType: input.decisionType || '', decisionScope: input.decisionScope || ''
  });
  return appendDecision_({
    rdCaseId: input.rdCaseId || '', decisionType: input.decisionType || '', decisionScope: input.decisionScope || '',
    decisionValue: input.decisionValue || '', actor: input.actor || null, status: 'RECORDED',
    segregationRequired: Boolean(input.segregationRequired), evidenceRef: input.evidenceRef || '',
    previousDecisionId: previous ? previous.DECISION_ID : '', notes: input.notes || ''
  });
}

function listOpenDecisions_() {
  const decisions = readObjects_(RD_CONFIG.SHEETS.DECISIONS);
  const superseded = new Set(decisions.map(row => String(row.PREVIOUS_DECISION_ID || '').trim()).filter(Boolean));
  return decisions
    .filter(row => String(row.STATUS) === 'OPEN')
    .filter(row => !superseded.has(String(row.DECISION_ID)))
    .slice(-100).reverse();
}

function resolveOpenDecision(payload) {
  payload = payload || {};
  const decisionId = String(payload.decisionId || '').trim();
  assertRequired_(decisionId, 'decisionId');
  const found = findObjectById_(RD_CONFIG.SHEETS.DECISIONS, 'DECISION_ID', decisionId);
  if (!found) throw new Error('Không tìm thấy quyết định: ' + decisionId);
  const open = found.record;
  if (String(open.STATUS || '') !== 'OPEN') throw new Error('Quyết định không còn OPEN: ' + decisionId);

  const latest = latestOpenDecision_({
    rdCaseId: open.RD_CASE_ID || '', decisionType: open.DECISION_TYPE || '', decisionScope: open.DECISION_SCOPE || ''
  });
  if (!latest || String(latest.DECISION_ID) !== decisionId) {
    throw new Error('Quyết định đã được thay thế hoặc không còn hiệu lực: ' + decisionId);
  }

  const type = String(open.DECISION_TYPE || '').trim().toUpperCase();
  const reason = String(payload.reason || '').trim();
  assertRequired_(reason, 'reason');

  if (type === 'WORK_PRIORITY_SELECTION') {
    requireHai_();
    const priority = String(payload.priority || '').trim().toUpperCase();
    assertRequired_(priority, 'priority');
    return setRequestPriority(String(open.DECISION_SCOPE || ''), priority, reason);
  }
  if (type === 'FAMILY_SCOPE_CONFIRMATION') {
    requireHai_();
    return confirmRequestFamily(String(open.DECISION_SCOPE || ''), '', reason);
  }
  if (type === 'M0_INPUT_CONFIRMATION') {
    const actor = requirePermission_('approveGate');
    const value = String(payload.decision || '').trim().toUpperCase();
    assertIn_(value, ['CONFIRMED_M0', 'RESEARCH_MORE', 'HOLD'], 'M0_DECISION');
    const resultId = recordDecisionResult_({
      rdCaseId: open.RD_CASE_ID || '', decisionType: open.DECISION_TYPE,
      decisionScope: open.DECISION_SCOPE, decisionValue: value, actor,
      evidenceRef: open.EVIDENCE_REF || '', notes: reason
    });
    if (value === 'CONFIRMED_M0' && open.RD_CASE_ID) {
      releaseResearchFanoutAfterM0_(String(open.RD_CASE_ID), actor);
    }
    appendAudit_({
      actor, action: 'RESOLVE_M0_INPUT_DECISION', entityType: 'RD_CASE', entityId: open.RD_CASE_ID || '',
      beforeState: 'OPEN', afterState: value, evidenceRef: resultId, result: 'RECORDED', notes: reason
    });
    return { ok: true, decisionId: resultId, decision: value, rdCaseId: open.RD_CASE_ID || '' };
  }
  throw new Error('Loại quyết định chưa được phép xử lý trực tiếp trên UX: ' + type);
}
