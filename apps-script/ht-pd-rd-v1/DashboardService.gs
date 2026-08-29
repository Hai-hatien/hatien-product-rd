function getBootstrapData() {
  const actor = getActorContext_();
  if (!actor.allowed) return restrictedBootstrap_(actor);

  const requests = readObjects_(RD_CONFIG.SHEETS.REQUESTS).slice(-100).reverse();
  const cases = readObjects_(RD_CONFIG.SHEETS.PORTFOLIO).slice(-100).reverse();
  const openDecisions = listOpenDecisions_();
  const tasks = listMyTasks_(actor.email);
  const evidence = readObjects_(RD_CONFIG.SHEETS.EVIDENCE).slice(-100).reverse();
  const canOperate = Boolean(actor.permissions && actor.permissions.technicalOperate);
  const flowSchedule = canOperate ? readFlowSchedule_() : [];
  const recentRuns = canOperate ? readObjects_(RD_CONFIG.SHEETS.FLOW_RUN_LOG).slice(-12).reverse() : [];
  const agentAssignments = canOperate
    ? RD_AGENT_REGISTRY.map(agent => Object.assign({}, agent, resolveAgentModel_(agent)))
    : [];

  return serializeForClient_({
    project: {
      code: RD_CONFIG.PROJECT_CODE,
      version: RD_CONFIG.VERSION,
      environment: RD_CONFIG.ENVIRONMENT,
      scope: 'Toàn hệ sinh thái sản phẩm Hà Tiên',
      priorityScopes: RD_CONFIG.PRIORITY_PRODUCT_SCOPES,
      productMasterMode: RD_CONFIG.PRODUCT_MASTER_MODE,
      wordpressConnection: RD_CONFIG.WORDPRESS_CONNECTION
    },
    actor,
    restricted: false,
    kpis: getKpis_(),
    decisionCards: buildDecisionCardsForUi_(actor, requests, cases, openDecisions),
    candidateLibrary: buildCandidateLibraryForUi_(requests, cases),
    tasks,
    requests,
    cases,
    evidence,
    productFamilies: (RD_CONFIG.PRODUCT_FAMILY_REFERENCES || []).map(item => Object.assign({}, item, {
      sourceRecordType: 'FAMILY_CONTAINER',
      sourceStatus: 'REVIEW_REQUIRED',
      sourceLabel: 'ID dòng nguồn — không phải mã Product/Model/SKU'
    })),
    flowSchedule,
    recentRuns,
    agentAssignments,
    productSource: {
      authority: 'Kế hoạch HTG - STG - HTC 2026',
      mode: RD_CONFIG.PRODUCT_MASTER_MODE,
      sourceRecordType: 'FAMILY_CONTAINER',
      familyCount: (RD_CONFIG.PRODUCT_FAMILY_REFERENCES || []).length,
      note: 'ID dòng nguồn chỉ dùng tham chiếu; không tự cấp Product ID, Canonical Model hoặc SKU.'
    },
    weeklyPack: buildWeeklyPackForUi_(cases, openDecisions, tasks),
    runtime: getRuntimeStatusForUi_()
  });
}

function getRuntimeStatusForUi_() {
  let triggerSnapshot = { installed: false, triggers: [], missingFlows: [] };
  try { triggerSnapshot = triggerRuntimeSnapshot_(); } catch (error) {}

  let gemini = { configured: false, model: RD_CONFIG.GEMINI.DEFAULT_MODEL };
  try { gemini = verifyGeminiRuntime_(); } catch (error) {}

  const runs = readObjects_(RD_CONFIG.SHEETS.FLOW_RUN_LOG);
  const latest = runs.length ? runs[runs.length - 1] : null;

  return {
    schedule: 'R1/R2/R3 fan-out 06:30 • R0-R8 theo 95_Flow_Schedule',
    triggerInstalled: Boolean(triggerSnapshot.installed),
    triggerCount: (triggerSnapshot.triggers || []).length,
    missingFlows: triggerSnapshot.missingFlows || [],
    aiConfigured: Boolean(gemini.configured),
    aiModel: gemini.model || RD_CONFIG.GEMINI.DEFAULT_MODEL,
    lastDailyRunAt: latest ? (latest.FINISHED_AT || latest.STARTED_AT || '') : '',
    lastDailyRunStatus: latest ? (latest.RUN_STATUS || '') : '',
    deploymentUrl: ScriptApp.getService().getUrl() || ''
  };
}

function getKpis_() {
  const requests = readObjects_(RD_CONFIG.SHEETS.REQUESTS);
  const portfolio = readObjects_(RD_CONFIG.SHEETS.PORTFOLIO);
  const tasks = readObjects_(RD_CONFIG.SHEETS.TASKS);
  const decisions = listOpenDecisions_();
  const evidence = readObjects_(RD_CONFIG.SHEETS.EVIDENCE);
  const testResults = readObjects_(RD_CONFIG.SHEETS.TEST_RESULTS);
  const claims = readObjects_(RD_CONFIG.SHEETS.CLAIMS);

  const activeCases = portfolio.filter(row => !['STOPPED', 'APPROVED_HANDOVER'].includes(String(row.CASE_STATUS || '')));
  const blockerP0P1 = tasks.filter(row =>
    ['P0', 'P1'].includes(String(row.PRIORITY || '')) &&
    ['BLOCKED', 'WAITING_INPUT', 'WAITING_AUTHORIZED_APPROVAL'].includes(String(row.STATUS || ''))
  );
  const casesWithEvidence = new Set(evidence.map(row => String(row.RD_CASE_ID || '')).filter(Boolean));
  const traceableTests = testResults.filter(row =>
    String(row.REVISION_ID || '').trim() &&
    String(row.TEST_RUN_ID || '').trim() &&
    String(row.EVIDENCE_IDS || '').trim()
  );
  const claimsMissingEvidence = claims.filter(row => !String(row.EVIDENCE_IDS || '').trim());

  return {
    requestCount: requests.length,
    activeCaseCount: activeCases.length,
    openDecisionCount: decisions.length,
    readyTaskCount: tasks.filter(row => ['READY', 'READY_MONITORING'].includes(String(row.STATUS || ''))).length,
    blockerCount: tasks.filter(row => ['BLOCKED', 'WAITING_DEPENDENCY', 'WAITING_INPUT'].includes(String(row.STATUS || ''))).length,
    blockerP0P1Count: blockerP0P1.length,
    evidenceCoverage: portfolio.length ? Math.round((casesWithEvidence.size / portfolio.length) * 100) : null,
    traceableTestRate: testResults.length ? Math.round((traceableTests.length / testResults.length) * 100) : null,
    claimsMissingEvidence: claimsMissingEvidence.length,
    handoverCount: portfolio.filter(row => String(row.FINAL_HANDOVER || '') === 'APPROVED_FOR_PRODUCT_MASTER_REVIEW').length
  };
}

function buildDecisionCardsForUi_(actor, requests, cases, openDecisions) {
  const cards = [];

  requests.forEach(request => {
    if (String(request.REQUEST_STATUS || '') !== 'REQUESTED') return;
    const hasSource = Boolean(String(request.SOURCE_URL_OR_FILE || '').trim());
    cards.push({
      cardType: 'RESEARCH_REQUEST',
      id: request.RD_REQUEST_ID,
      rdRequestId: request.RD_REQUEST_ID,
      rdCaseId: '',
      title: request.REQUEST_TITLE || request.RD_REQUEST_ID,
      subtitle: request.TARGET_PRODUCT || '',
      gateLabel: 'Yêu cầu nghiên cứu',
      status: 'REQUESTED',
      customer: request.TARGET_CUSTOMER || 'CHƯA BIẾT',
      problem: request.CUSTOMER_PAIN || 'CHƯA BIẾT',
      evidence: hasSource ? 'Có nguồn đầu vào' : 'Chưa có nguồn đầu vào',
      evidenceCount: hasSource ? 1 : 0,
      recommendation: 'Duyệt nghiên cứu / bổ sung / giữ / từ chối',
      canApprove: Boolean(actor.permissions && actor.permissions.approveGate),
      canSetPriority: Boolean(actor.permissions && actor.permissions.setPriority) || Boolean(actor.uatHaiProxy),
      dueDate: readRequestMeta_(request.NOTES).decisionDueDate || ''
    });
  });

  openDecisions.forEach(decision => {
    const scope = String(decision.DECISION_SCOPE || '');
    const caseId = String(decision.RD_CASE_ID || '');
    const relatedCase = cases.find(row => String(row.RD_CASE_ID || '') === caseId);
    cards.push({
      cardType: 'OPEN_DECISION',
      id: decision.DECISION_ID,
      decisionId: decision.DECISION_ID,
      rdRequestId: scope.startsWith('RDREQ-') ? scope : '',
      rdCaseId: caseId,
      title: relatedCase ? (relatedCase.CASE_TITLE || caseId) : (decision.DECISION_TYPE || decision.DECISION_ID),
      subtitle: decision.DECISION_TYPE || '',
      gateLabel: 'Quyết định mở',
      status: 'WAITING_AUTHORIZED_APPROVAL',
      problem: decision.NOTES || '',
      evidence: decision.EVIDENCE_REF || 'CHƯA CÓ',
      recommendation: 'Mở hồ sơ và quyết định theo phạm vi',
      canApprove: Boolean(actor.permissions && actor.permissions.approveGate),
      decisionType: decision.DECISION_TYPE || ''
    });
  });

  return cards.slice(0, 100);
}

function buildCandidateLibraryForUi_(requests, cases) {
  const cards = [];
  const caseByRequest = {};
  cases.forEach(row => { if (row.RD_REQUEST_ID) caseByRequest[String(row.RD_REQUEST_ID)] = row; });

  requests.forEach(request => {
    const caseRow = caseByRequest[String(request.RD_REQUEST_ID)] || null;
    const caseId = caseRow ? String(caseRow.RD_CASE_ID || '') : '';
    const statusGroup = !caseRow
      ? (String(request.REQUEST_STATUS || '') === 'REQUESTED' ? 'WAITING_APPROVAL' : 'IN_RD')
      : (String(caseRow.FINAL_HANDOVER || '') === 'APPROVED_FOR_PRODUCT_MASTER_REVIEW' ? 'HANDED_OVER' : 'IN_RD');
    cards.push({
      candidateId: caseId || String(request.RD_REQUEST_ID || ''),
      rdRequestId: String(request.RD_REQUEST_ID || ''),
      rdCaseId: caseId,
      origin: 'HUMAN',
      statusGroup,
      stage: caseRow ? String(caseRow.CURRENT_STAGE || '') : String(request.REQUEST_STATUS || ''),
      title: String((caseRow && caseRow.CASE_TITLE) || request.REQUEST_TITLE || 'R&D Candidate'),
      productScope: String(request.TARGET_PRODUCT || ''),
      customer: String(request.TARGET_CUSTOMER || 'CHƯA BIẾT'),
      pain: String(request.CUSTOMER_PAIN || 'CHƯA BIẾT'),
      value: String(request.TARGET_OUTCOMES || 'CHƯA CÓ DỮ LIỆU ĐỦ'),
      evidenceCount: 0
    });
  });

  const aiRows = readObjects_(candidateSheetName_());
  aiRows.forEach(row => {
    cards.push({
      candidateId: String(row.RD_CANDIDATE_ID || ''),
      rdRequestId: String(row.RD_REQUEST_ID || ''),
      rdCaseId: '',
      origin: 'AI',
      statusGroup: 'AI_PROPOSAL',
      stage: String(row.CANDIDATE_STATUS || 'CANDIDATE'),
      title: String(row.CANDIDATE_TITLE || row.TARGET_PRODUCT || 'Đề xuất R&D'),
      productScope: String(row.TARGET_PRODUCT || ''),
      customer: String(row.CUSTOMER_SEGMENT || 'CHƯA BIẾT'),
      pain: String(row.PAIN_SIGNAL || 'CHƯA BIẾT'),
      value: String(row.OPPORTUNITY_SUMMARY || 'CHƯA CÓ DỮ LIỆU ĐỦ'),
      evidenceCount: String(row.SOURCE_SIGNAL_IDS || '').split('|').filter(Boolean).length,
      confidence: String(row.CONFIDENCE || '')
    });
  });

  return cards.slice(-200).reverse();
}

function buildWeeklyPackForUi_(cases, openDecisions, tasks) {
  const blockers = tasks.filter(row => ['BLOCKED', 'WAITING_INPUT', 'WAITING_DEPENDENCY'].includes(String(row.STATUS || '')));
  return {
    lines: [
      cases.length + ' hồ sơ R&D đang được theo dõi.',
      openDecisions.length + ' quyết định đang mở.',
      blockers.length + ' blocker/chờ đầu vào.',
      tasks.filter(row => ['READY', 'READY_MONITORING'].includes(String(row.STATUS || ''))).length + ' task sẵn sàng.'
    ]
  };
}

function getCaseDetail(caseId) {
  const found = findObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId);
  if (!found) throw new Error('Không tìm thấy hồ sơ: ' + caseId);
  return serializeForClient_({
    caseRecord: found.record,
    tasks: readObjects_(RD_CONFIG.SHEETS.TASKS).filter(row => String(row.RD_CASE_ID) === String(caseId)),
    market: readObjects_(RD_CONFIG.SHEETS.MARKET_RESEARCH).filter(row => String(row.RD_CASE_ID) === String(caseId)),
    voc: readObjects_(RD_CONFIG.SHEETS.VOC).filter(row => String(row.RD_CASE_ID) === String(caseId)),
    benchmark: readObjects_(RD_CONFIG.SHEETS.BENCHMARK).filter(row => String(row.RD_CASE_ID) === String(caseId)),
    evidence: readObjects_(RD_CONFIG.SHEETS.EVIDENCE).filter(row => String(row.RD_CASE_ID) === String(caseId)),
    decisions: readObjects_(RD_CONFIG.SHEETS.DECISIONS).filter(row => String(row.RD_CASE_ID) === String(caseId))
  });
}
