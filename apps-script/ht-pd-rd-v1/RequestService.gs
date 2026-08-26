function createRdRequest(payload) {
  const actor = requirePermission_('createRequest');
  payload = payload || {};

  const requestTitle = String(payload.requestTitle || '').trim();
  const targetProduct = String(payload.targetProduct || '').trim();
  const requestKind = String(payload.requestKind || 'IMPROVEMENT').trim().toUpperCase();
  assertRequired_(requestTitle, 'requestTitle');
  assertRequired_(targetProduct, 'targetProduct');
  assertIn_(requestKind, ['IMPROVEMENT', 'CUSTOM_VARIANT', 'NEW_PRODUCT'], 'requestKind');

  const existing = readObjects_(RD_CONFIG.SHEETS.REQUESTS)
    .filter(row => !['REJECTED'].includes(String(row.REQUEST_STATUS || '')))
    .find(row => normalize_(row.REQUEST_TITLE) === normalize_(requestTitle) && normalize_(row.TARGET_PRODUCT) === normalize_(targetProduct));
  if (existing) throw new Error('Phát hiện yêu cầu tương tự đang tồn tại: ' + existing.RD_REQUEST_ID);

  const requestedPriority = String(payload.workPriority || '').trim().toUpperCase();
  if (requestedPriority) {
    assertIn_(requestedPriority, RD_ENUM.PRIORITY, 'WORK_PRIORITY');
    if (!actor.permissions.setPriority) throw new Error('Chỉ Anh Hải được chọn P0-P3.');
  }

  let scopeType = 'FAMILY_REFERENCE';
  if (requestKind === 'CUSTOM_VARIANT') scopeType = 'CUSTOM_VARIANT';
  if (requestKind === 'NEW_PRODUCT') scopeType = 'NEW_PRODUCT';
  assertIn_(scopeType, RD_ENUM.SCOPE_TYPE, 'RD_SCOPE_TYPE');

  const isPriorityFamily = normalize_(targetProduct) === normalize_(RD_CONFIG.PRIORITY_PRODUCT_SCOPE);
  const isHai = actor.email === RD_CONFIG.FINAL_APPROVER || Boolean(actor.uatHaiProxy);
  const requestId = nextId_('RDREQ');
  const meta = {
    requestKind,
    energySource: String(payload.energySource || 'CHƯA BIẾT'),
    sizeLimit: String(payload.sizeLimit || 'CHƯA BIẾT'),
    materialEnvironment: String(payload.materialEnvironment || 'CHƯA BIẾT'),
    targetBudget: String(payload.targetBudget || 'CHƯA BIẾT'),
    decisionDueDate: String(payload.decisionDueDate || ''),
    priorityReason: String(payload.priorityReason || ''),
    requiredEvidence: String(payload.requiredEvidence || ''),
    createdFrom: 'DASHBOARD_V1_3_1'
  };

  appendObject_(RD_CONFIG.SHEETS.REQUESTS, {
    RD_REQUEST_ID: requestId,
    REQUEST_TITLE: requestTitle,
    REQUESTED_AT: nowIso_(),
    REQUESTED_BY: actor.email,
    REQUESTER_ROLE: actor.roleCode,
    RD_SCOPE_TYPE: scopeType,
    TARGET_PRODUCT: targetProduct,
    SOURCE_RECORD_TYPE: isPriorityFamily ? RD_CONFIG.PRODUCT_MASTER_REFERENCE.sourceRecordType : '',
    SOURCE_FAMILY_CONTAINER_ID: isPriorityFamily ? RD_CONFIG.PRODUCT_MASTER_REFERENCE.sourceFamilyContainerId : '',
    SOURCE_FAMILY_KEY: isPriorityFamily ? RD_CONFIG.PRODUCT_MASTER_REFERENCE.sourceFamilyKey : '',
    REQUEST_STATUS: 'REQUESTED',
    FAMILY_ASSIGNMENT_STATUS: isHai ? 'CONFIRMED_BY_HAI' : 'PENDING_HAI',
    WORK_PRIORITY: requestedPriority,
    PRIORITY_STATUS: requestedPriority ? 'CONFIRMED_BY_HAI' : 'PENDING_HAI_PRIORITY',
    TARGET_MARKET: String(payload.targetMarket || 'CHƯA BIẾT'),
    TARGET_CUSTOMER: String(payload.targetCustomer || 'CHƯA BIẾT'),
    CUSTOMER_PAIN: String(payload.customerPain || 'CHƯA BIẾT'),
    TARGET_OUTCOMES: String(payload.targetOutcomes || 'CHƯA BIẾT'),
    CONSTRAINTS: String(payload.constraints || 'CHƯA BIẾT'),
    SOURCE_TYPE: String(payload.sourceType || 'INTERNAL_REQUEST'),
    SOURCE_URL_OR_FILE: String(payload.sourceRef || ''),
    FINAL_APPROVER: RD_CONFIG.FINAL_APPROVER,
    DEDUP_STATUS: 'NO_DUPLICATE_FOUND_IN_RD_MASTER',
    NOTES: mergeRequestMeta_(payload.notes || '', meta)
  });

  if (!isHai || !requestedPriority) {
    ensureOpenDecision_({ rdCaseId: '', decisionType: 'WORK_PRIORITY_SELECTION', decisionScope: requestId, notes: 'Chỉ Anh Hải được chọn P0-P3.' });
  }
  if (!isHai) {
    ensureOpenDecision_({ rdCaseId: '', decisionType: 'FAMILY_SCOPE_CONFIRMATION', decisionScope: requestId, notes: 'Chỉ Anh Hải được xác nhận dòng sản phẩm.' });
  }
  ensureOpenDecision_({
    rdCaseId: '', decisionType: 'RESEARCH_GATE', decisionScope: requestId,
    notes: 'Hải hoặc CMO duyệt bắt đầu nghiên cứu; sau M0, R1/R2/R3 chạy song song.'
  });

  appendAudit_({ actor, action: 'CREATE_RD_REQUEST', entityType: 'RD_REQUEST', entityId: requestId,
    beforeState: '', afterState: 'REQUESTED', evidenceRef: payload.sourceRef || '', result: 'RECORDED',
    notes: JSON.stringify({ scopeType, targetProduct, requestKind }) });
  SpreadsheetApp.flush();
  return { ok: true, requestId, status: 'REQUESTED' };
}

function setRequestPriority(requestId, priority, reason) {
  const actor = requireHai_();
  priority = String(priority || '').trim().toUpperCase();
  assertIn_(priority, RD_ENUM.PRIORITY, 'WORK_PRIORITY');
  const before = findObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', requestId);
  if (!before) throw new Error('Không tìm thấy request: ' + requestId);

  const updated = updateObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', requestId, {
    WORK_PRIORITY: priority,
    PRIORITY_STATUS: 'CONFIRMED_BY_HAI',
    FAMILY_ASSIGNMENT_STATUS: 'CONFIRMED_BY_HAI',
    NOTES: mergeRequestMeta_(before.record.NOTES, { priorityReason: String(reason || '') })
  });

  const caseRecord = getCaseByRequestId_(requestId);
  if (caseRecord) {
    updateObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseRecord.RD_CASE_ID, {
      WORK_PRIORITY: priority, PRIORITY_STATUS: 'CONFIRMED_BY_HAI'
    });
    updateObjectsByFilter_(RD_CONFIG.SHEETS.TASKS,
      row => String(row.RD_CASE_ID) === String(caseRecord.RD_CASE_ID) && !String(row.PRIORITY || '').trim(),
      { PRIORITY: priority, UPDATED_AT: nowIso_() });
  }

  const decisionId = recordDecisionResult_({
    rdCaseId: caseRecord ? caseRecord.RD_CASE_ID : '', decisionType: 'WORK_PRIORITY_SELECTION',
    decisionScope: requestId, decisionValue: priority, actor, notes: reason || ''
  });
  appendAudit_({ actor, action: 'SET_WORK_PRIORITY', entityType: 'RD_REQUEST', entityId: requestId,
    beforeState: String(before.record.WORK_PRIORITY || ''), afterState: priority,
    evidenceRef: decisionId, result: 'RECORDED', notes: reason || '' });
  return { ok: true, request: updated, decisionId };
}

function confirmRequestFamily(requestId, targetProduct, reason) {
  const actor = requireHai_();
  const found = findObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', requestId);
  if (!found) throw new Error('Không tìm thấy request: ' + requestId);
  targetProduct = String(targetProduct || found.record.TARGET_PRODUCT || '').trim();
  assertRequired_(targetProduct, 'targetProduct');
  const isPriorityFamily = normalize_(targetProduct) === normalize_(RD_CONFIG.PRIORITY_PRODUCT_SCOPE);
  const updated = updateObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', requestId, {
    TARGET_PRODUCT: targetProduct,
    FAMILY_ASSIGNMENT_STATUS: 'CONFIRMED_BY_HAI',
    SOURCE_RECORD_TYPE: isPriorityFamily ? RD_CONFIG.PRODUCT_MASTER_REFERENCE.sourceRecordType : '',
    SOURCE_FAMILY_CONTAINER_ID: isPriorityFamily ? RD_CONFIG.PRODUCT_MASTER_REFERENCE.sourceFamilyContainerId : '',
    SOURCE_FAMILY_KEY: isPriorityFamily ? RD_CONFIG.PRODUCT_MASTER_REFERENCE.sourceFamilyKey : ''
  });
  const caseRecord = getCaseByRequestId_(requestId);
  if (caseRecord) {
    updateObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseRecord.RD_CASE_ID, {
      PRODUCT_SCOPE: targetProduct,
      SOURCE_FAMILY_CONTAINER_ID: isPriorityFamily ? RD_CONFIG.PRODUCT_MASTER_REFERENCE.sourceFamilyContainerId : ''
    });
  }
  const decisionId = recordDecisionResult_({
    rdCaseId: caseRecord ? caseRecord.RD_CASE_ID : '', decisionType: 'FAMILY_SCOPE_CONFIRMATION',
    decisionScope: requestId, decisionValue: targetProduct, actor, notes: reason || ''
  });
  appendAudit_({ actor, action: 'CONFIRM_PRODUCT_SCOPE', entityType: 'RD_REQUEST', entityId: requestId,
    beforeState: String(found.record.TARGET_PRODUCT || ''), afterState: targetProduct,
    evidenceRef: decisionId, result: 'RECORDED', notes: reason || '' });
  return { ok: true, request: updated, decisionId };
}

function approveResearch(requestId, decision, notes) {
  const actor = requirePermission_('approveGate');
  decision = String(decision || '').trim().toUpperCase();
  assertIn_(decision, ['RESEARCH_APPROVED', 'NEED_MORE_INFO', 'HOLD', 'REJECTED'], 'RESEARCH_DECISION');
  const found = findObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', requestId);
  if (!found) throw new Error('Không tìm thấy request: ' + requestId);
  const previous = String(found.record.REQUEST_STATUS || '');
  updateObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', requestId, { REQUEST_STATUS: decision });

  let caseId = '';
  if (decision === 'RESEARCH_APPROVED') {
    caseId = ensureCaseForRequest_(found.record, actor);
    ensureOpenDecision_({
      rdCaseId: caseId, decisionType: 'M0_INPUT_CONFIRMATION',
      decisionScope: 'TARGET_USE_CASE_MARKET_CONSTRAINTS', evidenceRef: requestId,
      notes: 'Xác nhận dữ liệu M0 tối thiểu; mục chưa biết giữ CHƯA BIẾT.'
    });
  }

  const decisionId = recordDecisionResult_({
    rdCaseId: caseId, decisionType: 'RESEARCH_GATE', decisionScope: requestId,
    decisionValue: decision, actor, evidenceRef: requestId, notes: notes || ''
  });
  appendAudit_({ actor, action: 'RESEARCH_GATE_DECISION', entityType: 'RD_REQUEST', entityId: requestId,
    beforeState: previous, afterState: decision, evidenceRef: decisionId, result: 'RECORDED', notes: notes || '' });
  return { ok: true, requestId, caseId, decision, decisionId };
}

function ensureCaseForRequest_(request, actor) {
  const existing = getCaseByRequestId_(request.RD_REQUEST_ID);
  if (existing) return String(existing.RD_CASE_ID);
  const caseId = nextId_('RDCASE');
  appendObject_(RD_CONFIG.SHEETS.PORTFOLIO, {
    RD_CASE_ID: caseId,
    RD_REQUEST_ID: request.RD_REQUEST_ID,
    CASE_TITLE: request.REQUEST_TITLE,
    CREATED_AT: nowIso_(),
    CASE_OWNER: 'gpt@hatiencorp.vn',
    PRODUCT_SCOPE: request.TARGET_PRODUCT,
    SOURCE_FAMILY_CONTAINER_ID: request.SOURCE_FAMILY_CONTAINER_ID || '',
    CURRENT_STAGE: 'M0',
    CASE_STATUS: 'M0_IN_PROGRESS',
    M4_DECISION: 'PENDING',
    CONCEPT_GATE: 'NOT_STARTED', TECHNICAL_GATE: 'NOT_STARTED', DFM_GATE: 'NOT_STARTED',
    QA_GATE: 'MONITORING_ONLY', PILOT_GATE: 'NOT_STARTED', FINAL_HANDOVER: 'NOT_STARTED',
    WORK_PRIORITY: request.WORK_PRIORITY || '',
    PRIORITY_STATUS: request.PRIORITY_STATUS || 'PENDING_HAI_PRIORITY',
    NEXT_ACTION: 'M0 — khóa brief tối thiểu; sau đó fan-out R1/R2/R3',
    NEXT_ACTION_OWNER: 'gpt@hatiencorp.vn',
    DUE_DATE: readRequestMeta_(request.NOTES).decisionDueDate || '',
    BLOCKER_COUNT: 0,
    EVIDENCE_COVERAGE: 'MISSING',
    NOTES: 'Product Master read-only; không tự cấp mã sản phẩm.'
  });
  spawnCaseTasks_(caseId, request, actor);
  appendAudit_({ actor, action: 'CREATE_RD_CASE', entityType: 'RD_CASE', entityId: caseId,
    beforeState: 'REQUESTED', afterState: 'M0_IN_PROGRESS', evidenceRef: request.RD_REQUEST_ID,
    result: 'RECORDED', notes: 'Case created idempotently; M0 gates fan-out R1/R2/R3.' });
  return caseId;
}
