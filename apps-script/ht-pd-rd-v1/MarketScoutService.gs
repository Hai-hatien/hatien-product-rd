function candidateHeaders_() {
  const actual = headers_(candidateSheetName_());
  const missing = RD_CANDIDATE_HEADERS.filter(header => !actual.includes(header));
  if (missing.length) throw new Error(candidateSheetName_() + ' thiếu header: ' + missing.join(', '));
  return actual;
}

function nextCandidateId_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const day = todayKey_();
    const prefix = 'RDCAND-' + day + '-';
    let max = 0;
    readObjects_(candidateSheetName_()).forEach(row => {
      const match = String(row.RD_CANDIDATE_ID || '').match(new RegExp('^RDCAND-' + day + '-(\\d+)$'));
      if (match) max = Math.max(max, Number(match[1] || 0));
    });
    return prefix + String(max + 1).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

function candidateDedupKey_(input) {
  const base = [
    input.targetProduct,
    input.targetMarket,
    input.customerSegment,
    input.painSignal,
    input.opportunitySummary
  ].map(normalize_).join('|');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base, Utilities.Charset.UTF_8);
  return digest.map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function mergePipeValues_(left, right) {
  const values = [];
  [left, right].forEach(value => String(value || '').split('|').forEach(item => {
    const clean = item.trim();
    if (clean && !values.includes(clean)) values.push(clean);
  }));
  return values.join('|');
}

function marketSignalEligibleForCandidate_(signal) {
  const source = String(signal.SOURCE_URL_OR_FILE || '').trim();
  const label = String(signal.EVIDENCE_LABEL || '').trim();
  const signalType = String(signal.SIGNAL_TYPE || '').trim().toUpperCase();
  const status = String(signal.STATUS || '').trim().toUpperCase();
  if (!source) return false;
  if (!signalType || ['BRIEF', 'FACT_REGISTER', 'UNKNOWN_REGISTER', 'SEARCH_PLAN'].includes(signalType)) return false;
  const uatFixture = RD_CONFIG.ENVIRONMENT === 'UAT' && status === 'UAT_TEST_FIXTURE';
  return uatFixture || ['ĐÃ XÁC MINH', 'HẢI CUNG CẤP - CHỜ KIỂM CHỨNG'].includes(label);
}

function candidateInputFromMarketSignal_(signal) {
  const request = signal.RD_CASE_ID ? getRequestForCase_(String(signal.RD_CASE_ID)) : null;
  const targetProduct = request ? String(request.TARGET_PRODUCT || RD_CONFIG.PRIORITY_PRODUCT_SCOPE) : RD_CONFIG.PRIORITY_PRODUCT_SCOPE;
  const targetMarket = String(signal.MARKET || (request && request.TARGET_MARKET) || 'CHƯA BIẾT');
  const customerSegment = String(signal.SEGMENT || (request && request.TARGET_CUSTOMER) || 'CHƯA BIẾT');
  const painSignal = String(signal.EXTRACT || signal.RESEARCH_TOPIC || 'CHƯA BIẾT');
  const opportunitySummary = String(signal.RESEARCH_TOPIC || signal.SIGNAL_TYPE || 'Market signal');
  return {
    title: targetProduct + ' — ' + opportunitySummary,
    targetProduct,
    targetMarket,
    customerSegment,
    painSignal,
    opportunitySummary,
    sourceSignalId: String(signal.MARKET_EVIDENCE_ID || ''),
    sourceUrl: String(signal.SOURCE_URL_OR_FILE || ''),
    confidence: String(signal.CONFIDENCE || ''),
    provenance: {
      marketEvidenceId: String(signal.MARKET_EVIDENCE_ID || ''),
      sourceTitle: String(signal.SOURCE_TITLE || ''),
      sourceOrganization: String(signal.SOURCE_ORGANIZATION || ''),
      sourceUrlOrFile: String(signal.SOURCE_URL_OR_FILE || ''),
      publishedDate: String(signal.PUBLISHED_DATE || ''),
      accessedAt: String(signal.ACCESSED_AT || ''),
      evidenceLabel: String(signal.EVIDENCE_LABEL || ''),
      signalType: String(signal.SIGNAL_TYPE || ''),
      status: String(signal.STATUS || ''),
      rdCaseId: String(signal.RD_CASE_ID || '')
    }
  };
}

function upsertRdCandidateFromMarketSignal_(signal, actor) {
  candidateHeaders_();
  if (!marketSignalEligibleForCandidate_(signal)) {
    return { action: 'SKIPPED_NOT_ELIGIBLE', marketEvidenceId: String(signal.MARKET_EVIDENCE_ID || '') };
  }
  const input = candidateInputFromMarketSignal_(signal);
  const dedupKey = candidateDedupKey_(input);
  const existing = readObjects_(candidateSheetName_()).find(row => String(row.DEDUP_KEY || '') === dedupKey);
  const now = nowIso_();
  if (existing) {
    const provenance = parseJson_(existing.PROVENANCE_JSON, []);
    const list = Array.isArray(provenance) ? provenance : [provenance];
    const seen = list.some(item => String(item.marketEvidenceId || '') === input.sourceSignalId);
    if (!seen) list.push(input.provenance);
    updateObjectById_(candidateSheetName_(), 'RD_CANDIDATE_ID', existing.RD_CANDIDATE_ID, {
      SOURCE_SIGNAL_IDS: mergePipeValues_(existing.SOURCE_SIGNAL_IDS, input.sourceSignalId),
      SOURCE_URLS: mergePipeValues_(existing.SOURCE_URLS, input.sourceUrl),
      PROVENANCE_JSON: list,
      DEDUP_STATUS: 'MERGED_EXISTING',
      LAST_SEEN_AT: now,
      CONFIDENCE: input.confidence || existing.CONFIDENCE
    });
    return { action: 'DEDUP_MERGED', candidateId: String(existing.RD_CANDIDATE_ID), dedupKey };
  }

  const candidateId = nextCandidateId_();
  appendObject_(candidateSheetName_(), {
    RD_CANDIDATE_ID: candidateId,
    CANDIDATE_TITLE: input.title,
    TARGET_PRODUCT: input.targetProduct,
    TARGET_MARKET: input.targetMarket,
    CUSTOMER_SEGMENT: input.customerSegment,
    PAIN_SIGNAL: input.painSignal,
    OPPORTUNITY_SUMMARY: input.opportunitySummary,
    SOURCE_SIGNAL_IDS: input.sourceSignalId,
    SOURCE_URLS: input.sourceUrl,
    PROVENANCE_JSON: [input.provenance],
    DEDUP_KEY: dedupKey,
    DEDUP_STATUS: 'UNIQUE_NEW',
    CANDIDATE_STATUS: 'NEW',
    CONFIDENCE: input.confidence,
    CREATED_AT: now,
    CREATED_BY: actor.email,
    LAST_SEEN_AT: now,
    RD_REQUEST_ID: '',
    DECISION_STATUS: 'PENDING_REVIEW',
    NOTES: 'MARKET_SIGNAL→RD_CANDIDATE; chưa phải RD_REQUEST.'
  });
  return { action: 'CREATED', candidateId, dedupKey };
}

function appendMarketScoutRunLog_(input) {
  const runId = 'RUN-MARKET-SCOUT-' + todayKey_() + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendObject_(RD_CONFIG.SHEETS.FLOW_RUN_LOG, {
    RUN_ID: runId,
    FLOW_ID: 'MARKET_SCOUT',
    RD_CASE_ID: input.rdCaseId || '',
    SCHEDULED_FOR: input.scheduledFor || '',
    TRIGGER_ID: input.triggerId || '',
    STARTED_AT: input.startedAt || nowIso_(),
    FINISHED_AT: input.finishedAt || nowIso_(),
    EXECUTION_MODE: input.executionMode || 'UAT_RUNTIME',
    ATTEMPT: 1,
    LEASE_STATUS: 'NOT_REQUIRED',
    DEPENDENCY_STATUS: 'INDEPENDENT',
    API_STATUS: input.apiStatus || 'NOT_USED',
    REPORT_ID: '',
    RECORDS_IMPORTED: Number(input.recordsImported || 0),
    NEXT_FLOW: 'RD_CANDIDATE_REVIEW',
    RUN_STATUS: input.runStatus || 'COMPLETED',
    ERROR_CODE: input.errorCode || '',
    ERROR_MESSAGE: input.errorMessage || '',
    AUDIT_ID: input.auditId || '',
    NOTES: input.notes || ''
  });
  return runId;
}

/**
 * Independent transformation cycle: existing provenance-bearing MARKET_SIGNAL
 * records -> deduplicated RD_CANDIDATE records. It does not create RD_REQUEST.
 */
function runMarketScoutCandidateCycleUat() {
  const actor = requireTechnicalOperator_();
  if (RD_CONFIG.ENVIRONMENT !== 'UAT') throw new Error('Market Scout cycle chỉ được phép ở UAT hiện tại.');
  const startedAt = nowIso_();
  const signals = readObjects_(RD_CONFIG.SHEETS.MARKET_RESEARCH).filter(marketSignalEligibleForCandidate_);
  const results = signals.map(signal => upsertRdCandidateFromMarketSignal_(signal, actor));
  const imported = results.filter(item => ['CREATED', 'DEDUP_MERGED'].includes(item.action)).length;
  const auditId = appendAudit_({
    actor,
    action: 'RUN_MARKET_SCOUT_CANDIDATE_CYCLE_UAT',
    entityType: 'FLOW',
    entityId: 'MARKET_SCOUT',
    beforeState: 'MARKET_SIGNAL_COUNT=' + signals.length,
    afterState: 'CANDIDATE_IMPORT_COUNT=' + imported,
    evidenceRef: results.map(item => item.candidateId || item.marketEvidenceId || '').filter(Boolean).join('|'),
    result: 'RECORDED',
    notes: JSON.stringify(results)
  });
  const runId = appendMarketScoutRunLog_({
    startedAt,
    finishedAt: nowIso_(),
    recordsImported: imported,
    runStatus: 'COMPLETED',
    auditId,
    notes: JSON.stringify({ signalCount: signals.length, results })
  });
  return { ok: true, runId, auditId, signalCount: signals.length, imported, results };
}
