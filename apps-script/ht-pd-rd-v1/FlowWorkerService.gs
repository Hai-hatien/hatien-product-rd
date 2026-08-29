/**
 * Gemini worker for scheduled R0-R8 work.
 *
 * V1 safety contract:
 * - Processes only tasks whose current status is READY.
 * - Writes a reviewable report to 20_Flow_Reports.
 * - Moves the task to HANDOFF_READY; never auto-approves a gate.
 * - Never invents product codes. The only authoritative product-code source is
 *   "Kế hoạch HTG - STG - HTC 2026" and codes absent from supplied context stay unknown.
 */
const RD_FLOW_WORKER = Object.freeze({
  PRODUCT_CODE_SOURCE: 'Kế hoạch HTG - STG - HTC 2026',
  MAX_CONTEXT_ROWS_PER_SHEET: 25,
  MAX_CONTEXT_CHARS: 30000,
  PROFILES: Object.freeze({
    R0: Object.freeze({ role: 'G0 Case Controller / PM', purpose: 'Điều phối case, task, blocker và hàng đợi quyết định.' }),
    R1: Object.freeze({ role: 'Market Intelligence', purpose: 'Phân tích tín hiệu thị trường và khoảng trống bằng chứng.' }),
    R2: Object.freeze({ role: 'Customer & JTBD', purpose: 'Làm rõ use case, pain, JTBD và dữ liệu VOC còn thiếu.' }),
    R3: Object.freeze({ role: 'Competitor Benchmark', purpose: 'Chuẩn hóa benchmark, nguồn và khoảng trống so sánh.' }),
    R4: Object.freeze({ role: 'Product Engineering Coordinator', purpose: 'Chuẩn bị requirement và concept kỹ thuật sản phẩm; không phải DEV phần mềm.' }),
    R5: Object.freeze({ role: 'Prototype & Test Planning', purpose: 'Chuẩn bị kế hoạch prototype và thử nghiệm sản phẩm; không phải Tester UAT phần mềm.' }),
    R6: Object.freeze({ role: 'DFM & Cost Coordinator', purpose: 'Phân tích DFM/DFA và cost driver; không bịa đơn giá.' }),
    R7: Object.freeze({ role: 'Proof / Claim / Safety QA', purpose: 'Rà claim, nguồn, an toàn và mức sẵn sàng bằng chứng; không tự PASS.' }),
    R8: Object.freeze({ role: 'Pilot & Handover Coordinator', purpose: 'Chuẩn bị pilot và handover; không phát hành SKU hay duyệt cuối.' })
  })
});

function geminiWorkerRuntime_() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = String(props.getProperty(RD_CONFIG.GEMINI.API_KEY_PROPERTY) || '').trim();
  const model = String(props.getProperty(RD_CONFIG.GEMINI.MODEL_PROPERTY) || RD_CONFIG.GEMINI.DEFAULT_MODEL || '').trim();
  return { configured: Boolean(apiKey), apiKey, model };
}

function flowWorkerProfile_(flowId) {
  const profile = RD_FLOW_WORKER.PROFILES[String(flowId || '').trim().toUpperCase()];
  if (!profile) throw new Error('Chưa có worker profile cho flow ' + flowId + '.');
  return profile;
}

function flowInputSheets_(schedule) {
  return String(schedule.INPUT_SHEETS || '')
    .split(/[|,;]/)
    .map(value => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function rowsForCase_(sheetName, caseId, requestId) {
  try {
    return readObjects_(sheetName)
      .filter(row => {
        const rowCaseId = String(row.RD_CASE_ID || '').trim();
        const rowRequestId = String(row.RD_REQUEST_ID || '').trim();
        if (rowCaseId) return rowCaseId === caseId;
        if (rowRequestId) return rowRequestId === requestId;
        return false;
      })
      .slice(-RD_FLOW_WORKER.MAX_CONTEXT_ROWS_PER_SHEET);
  } catch (error) {
    return [{ CONTEXT_ERROR: 'Không đọc được ' + sheetName + ': ' + error.message }];
  }
}

function buildFlowWorkerContext_(flowId, task, schedule) {
  const caseId = String(task.RD_CASE_ID || '').trim();
  const caseMatch = caseId ? findObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId) : null;
  const caseRecord = caseMatch ? caseMatch.record : {};
  const requestId = String(caseRecord.RD_REQUEST_ID || '').trim();
  const requestMatch = requestId ? findObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', requestId) : null;
  const sheetContext = {};

  flowInputSheets_(schedule).forEach(sheetName => {
    sheetContext[sheetName] = rowsForCase_(sheetName, caseId, requestId);
  });

  return {
    project: RD_CONFIG.PROJECT_CODE,
    environment: RD_CONFIG.ENVIRONMENT,
    flowId,
    task,
    portfolio: caseRecord,
    request: requestMatch ? requestMatch.record : {},
    evidenceBySheet: sheetContext,
    productCodePolicy: {
      sourceOfTruth: RD_FLOW_WORKER.PRODUCT_CODE_SOURCE,
      sourceIncludedInThisContext: false,
      rule: 'Không tạo, suy đoán hoặc gán mã sản phẩm khi chưa có dòng nguồn chính thức trong context.'
    }
  };
}

function buildFlowWorkerPrompt_(flowId, task, schedule) {
  const profile = flowWorkerProfile_(flowId);
  const context = buildFlowWorkerContext_(flowId, task, schedule);
  return [
    'Bạn đang chạy worker V1 cho hệ sinh thái sản phẩm Hà Tiên.',
    'Vai trò: ' + profile.role + '.',
    'Mục tiêu: ' + profile.purpose,
    '',
    'RÀNG BUỘC BẮT BUỘC:',
    '1. Chỉ dùng dữ liệu trong CONTEXT. Không bịa nguồn, số liệu, VOC, giá, kết quả test, chứng nhận hoặc quyết định.',
    '2. Tách FACT / ASSUMPTION / UNKNOWN rõ ràng. FACT phải có sourceRef trỏ về sheet hoặc record trong CONTEXT.',
    '3. Không tự PASS/FAIL gate, không tự phê duyệt, không phát hành Product ID/model/SKU.',
    '4. Bộ mã sản phẩm chỉ lấy từ "' + RD_FLOW_WORKER.PRODUCT_CODE_SOURCE + '". Nguồn này chưa nằm trong CONTEXT thì mã phải để UNKNOWN.',
    '5. R4-R8 là vai trò điều phối/kỹ thuật sản phẩm, không phải DEV phần mềm hay Tester UAT.',
    '6. Trả đúng một JSON object, không markdown, theo schema:',
    '{"summary":"...","facts":[{"statement":"...","sourceRef":"..."}],"assumptions":["..."],"unknowns":["..."],"recommendation":"...","records":[]}',
    '7. records để [] trong V1; worker chỉ tạo report để người có thẩm quyền duyệt.',
    '',
    'CONTEXT:',
    truncate_(JSON.stringify(context), RD_FLOW_WORKER.MAX_CONTEXT_CHARS)
  ].join('\n');
}

function extractGeminiText_(data) {
  const candidates = data && Array.isArray(data.candidates) ? data.candidates : [];
  if (!candidates.length) return '';
  const parts = candidates[0].content && Array.isArray(candidates[0].content.parts)
    ? candidates[0].content.parts : [];
  return parts.map(part => String(part.text || '')).join('\n').trim();
}

function parseWorkerJson_(text) {
  const cleaned = String(text || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const value = JSON.parse(cleaned);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Gemini worker không trả JSON object hợp lệ.');
  }
  return {
    summary: String(value.summary || '').trim(),
    facts: Array.isArray(value.facts) ? value.facts : [],
    assumptions: Array.isArray(value.assumptions) ? value.assumptions : [],
    unknowns: Array.isArray(value.unknowns) ? value.unknowns : [],
    recommendation: String(value.recommendation || '').trim(),
    records: []
  };
}

function callGeminiFlowWorker_(flowId, task, schedule) {
  const runtime = geminiWorkerRuntime_();
  if (!runtime.configured) {
    throw new Error('Chưa cấu hình Script Property ' + RD_CONFIG.GEMINI.API_KEY_PROPERTY + '.');
  }
  if (!runtime.model) throw new Error('Chưa cấu hình Gemini model.');

  const endpoint = RD_CONFIG.GEMINI.ENDPOINT_ROOT + encodeURIComponent(runtime.model) + ':generateContent';
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': runtime.apiKey },
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildFlowWorkerPrompt_(flowId, task, schedule) }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: Math.min(Number(RD_CONFIG.GEMINI.MAX_OUTPUT_TOKENS || 3000), 3000)
      }
    }),
    muteHttpExceptions: true
  });
  const statusCode = response.getResponseCode();
  const raw = response.getContentText();
  let data = null;
  try { data = JSON.parse(raw); } catch (error) {}
  if (statusCode < 200 || statusCode >= 300) {
    const safeMessage = data && data.error && data.error.message ? String(data.error.message) : 'HTTP ' + statusCode;
    throw new Error('Gemini worker call failed: ' + safeMessage);
  }
  const output = parseWorkerJson_(extractGeminiText_(data));
  if (!output.summary) throw new Error('Gemini worker trả report rỗng.');
  return { model: runtime.model, output };
}

function nextFlowReportId_(flowId) {
  return 'RPT-' + String(flowId) + '-' + todayKey_() + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function appendFlowWorkerReport_(input) {
  const reportId = nextFlowReportId_(input.flowId);
  appendObject_(RD_CONFIG.SHEETS.FLOW_REPORTS, {
    REPORT_ID: reportId,
    RUN_ID: input.runId,
    RD_CASE_ID: input.task.RD_CASE_ID || '',
    FLOW_ID: input.flowId,
    FLOW_NAME: input.schedule.FLOW_NAME || input.flowId,
    SCHEDULE_DATE: todayKey_(),
    STARTED_AT: input.startedAt,
    FINISHED_AT: nowIso_(),
    REPORT_STATUS: 'HANDOFF_READY',
    DEPENDENCY_STATUS: 'READY_AT_EXECUTION',
    SUMMARY: truncate_(input.result.output.summary, 45000),
    FACTS_JSON: truncate_(JSON.stringify(input.result.output.facts), 45000),
    ASSUMPTIONS_JSON: truncate_(JSON.stringify(input.result.output.assumptions), 45000),
    UNKNOWNS_JSON: truncate_(JSON.stringify(input.result.output.unknowns), 45000),
    RECOMMENDATION: truncate_(input.result.output.recommendation, 45000),
    RECORDS_JSON: '[]',
    RECORD_COUNT: 0,
    MODEL_PROVIDER: 'GEMINI',
    MODEL_NAME: input.result.model,
    IMPORT_STATUS: 'REPORT_ONLY_V1',
    NEXT_FLOW_READY: 'HUMAN_REVIEW_REQUIRED',
    ERROR_MESSAGE: ''
  });
  return reportId;
}

function claimReadyTask_(taskId, runId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return null;
  try {
    const match = findObjectById_(RD_CONFIG.SHEETS.TASKS, 'TASK_ID', taskId);
    if (!match || String(match.record.STATUS || '') !== 'READY') return null;
    updateObjectById_(RD_CONFIG.SHEETS.TASKS, 'TASK_ID', taskId, {
      STATUS: 'IN_PROGRESS',
      UPDATED_AT: nowIso_(),
      NOTES: truncate_(String(match.record.NOTES || '') + ' | Worker V1 claimed by ' + runId + '.', 45000)
    });
    return match.record;
  } finally {
    lock.releaseLock();
  }
}

function executeReadyTaskWorker_(flowId, task, schedule, runId) {
  const claimed = claimReadyTask_(String(task.TASK_ID || ''), runId);
  if (!claimed) return { taskId: task.TASK_ID, status: 'SKIPPED_NOT_READY' };
  const startedAt = nowIso_();
  try {
    const result = callGeminiFlowWorker_(flowId, claimed, schedule);
    const reportId = appendFlowWorkerReport_({ flowId, task: claimed, schedule, runId, startedAt, result });
    updateObjectById_(RD_CONFIG.SHEETS.TASKS, 'TASK_ID', claimed.TASK_ID, {
      STATUS: 'HANDOFF_READY',
      UPDATED_AT: nowIso_(),
      NOTES: truncate_(String(claimed.NOTES || '') + ' | Gemini Worker V1 report=' + reportId + '; chờ người có thẩm quyền duyệt; không auto-pass gate.', 45000)
    });
    return { taskId: claimed.TASK_ID, status: 'HANDOFF_READY', reportId, model: result.model };
  } catch (error) {
    updateObjectById_(RD_CONFIG.SHEETS.TASKS, 'TASK_ID', claimed.TASK_ID, {
      STATUS: 'READY',
      UPDATED_AT: nowIso_(),
      NOTES: truncate_(String(claimed.NOTES || '') + ' | Worker V1 lỗi, giữ READY để retry: ' + error.message, 45000)
    });
    return { taskId: claimed.TASK_ID, status: 'ERROR', error: truncate_(error.message, 1000) };
  }
}
