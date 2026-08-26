const RD_APPEND_ONLY_SHEETS = Object.freeze([
  RD_CONFIG.SHEETS.DECISIONS,
  RD_CONFIG.SHEETS.AUDIT
]);

function getSs_() {
  return SpreadsheetApp.openById(RD_CONFIG.SPREADSHEET_ID);
}

function getSheet_(name) {
  const sheet = getSs_().getSheetByName(name);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + name);
  return sheet;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), RD_CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayKey_() {
  return Utilities.formatDate(new Date(), RD_CONFIG.TIME_ZONE, 'yyyyMMdd');
}

function normalize_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function truncate_(value, maxLength) {
  const text = String(value == null ? '' : value);
  const limit = Number(maxLength || 50000);
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…';
}

function assertIn_(value, allowed, fieldName) {
  if (!allowed.includes(value)) throw new Error(fieldName + ' không hợp lệ: ' + value);
}

function assertRequired_(value, fieldName) {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
    throw new Error('Thiếu trường bắt buộc: ' + fieldName);
  }
}

function headers_(sheetName) {
  const sheet = getSheet_(sheetName);
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error('Sheet không có header: ' + sheetName);
  return sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(String);
}

function readObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift().map(String);
  return values
    .filter(row => row.some(value => value !== '' && value !== null))
    .map((row, index) => {
      const record = Object.fromEntries(headers.map((header, col) => [header, row[col]]));
      Object.defineProperty(record, '__rowIndex', { value: index + 2, enumerable: false });
      return record;
    });
}

function appendObject_(sheetName, record) {
  const sheet = getSheet_(sheetName);
  const headers = headers_(sheetName);
  const row = headers.map(header => {
    const value = Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
    if (value === null || typeof value === 'undefined') return '';
    if (typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
    return value;
  });
  sheet.appendRow(row);
  return { rowIndex: sheet.getLastRow(), record: Object.fromEntries(headers.map((header, i) => [header, row[i]])) };
}

function findObjectById_(sheetName, idColumn, idValue) {
  const found = readObjects_(sheetName).find(row => String(row[idColumn]) === String(idValue));
  return found ? { rowIndex: found.__rowIndex, record: found } : null;
}

function assertMutableSheet_(sheetName, operation) {
  if (RD_APPEND_ONLY_SHEETS.includes(sheetName)) {
    throw new Error((operation || 'UPDATE') + ' bị chặn: ' + sheetName + ' là append-only. Chỉ repair UAT chuyên dụng mới được sửa lịch sử sau khi backup.');
  }
}

function updateObjectById_(sheetName, idColumn, idValue, patch) {
  assertMutableSheet_(sheetName, 'updateObjectById_');
  const found = findObjectById_(sheetName, idColumn, idValue);
  if (!found) throw new Error('Không tìm thấy ' + idValue + ' trong ' + sheetName);
  const sheet = getSheet_(sheetName);
  const headers = headers_(sheetName);
  Object.entries(patch || {}).forEach(([field, value]) => {
    const column = headers.indexOf(field);
    if (column < 0) throw new Error('Không có cột ' + field + ' trong ' + sheetName);
    const normalized = value === null || typeof value === 'undefined'
      ? ''
      : (typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : value);
    sheet.getRange(found.rowIndex, column + 1).setValue(normalized);
  });
  return findObjectById_(sheetName, idColumn, idValue).record;
}

function updateObjectsByFilter_(sheetName, predicate, patchFactory) {
  assertMutableSheet_(sheetName, 'updateObjectsByFilter_');
  const sheet = getSheet_(sheetName);
  const headers = headers_(sheetName);
  const records = readObjects_(sheetName);
  let changed = 0;
  records.forEach(record => {
    if (!predicate(record)) return;
    const patch = typeof patchFactory === 'function' ? patchFactory(record) : patchFactory;
    Object.entries(patch || {}).forEach(([field, value]) => {
      const column = headers.indexOf(field);
      if (column < 0) throw new Error('Không có cột ' + field + ' trong ' + sheetName);
      const normalized = value === null || typeof value === 'undefined'
        ? ''
        : (typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : value);
      sheet.getRange(record.__rowIndex, column + 1).setValue(normalized);
    });
    changed += 1;
  });
  return changed;
}

function parseJson_(value, fallback) {
  if (value === null || typeof value === 'undefined' || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (error) { return fallback; }
}

function mergeRequestMeta_(existingNotes, meta) {
  const prefix = 'RD_META:';
  const text = String(existingNotes || '');
  const current = text.startsWith(prefix) ? parseJson_(text.slice(prefix.length), {}) : {};
  return prefix + JSON.stringify(Object.assign({}, current, meta || {}));
}

function readRequestMeta_(notes) {
  const prefix = 'RD_META:';
  const text = String(notes || '');
  return text.startsWith(prefix) ? parseJson_(text.slice(prefix.length), {}) : {};
}

function nextId_(prefix) {
  const target = RD_ID_TARGETS[prefix];
  if (!target) throw new Error('Chưa cấu hình ID target cho prefix: ' + prefix);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const day = todayKey_();
    const regex = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-' + day + '-(\\d+)$');
    const rows = readObjects_(target.sheet);
    let maxFromSheet = 0;
    rows.forEach(row => {
      const match = String(row[target.column] || '').match(regex);
      if (match) maxFromSheet = Math.max(maxFromSheet, Number(match[1] || 0));
    });
    const key = 'COUNTER_' + prefix + '_' + day;
    const props = PropertiesService.getScriptProperties();
    const maxFromProperty = Number(props.getProperty(key) || 0);
    const next = Math.max(maxFromSheet, maxFromProperty) + 1;
    props.setProperty(key, String(next));
    return prefix + '-' + day + '-' + String(next).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

function appendAudit_(input) {
  input = input || {};
  const actor = input.actor || { email: '', roleCode: 'SYSTEM' };
  const auditId = nextId_('AUD');
  if (findObjectById_(RD_CONFIG.SHEETS.AUDIT, 'AUDIT_ID', auditId)) {
    throw new Error('AUDIT_ID collision trước append: ' + auditId);
  }
  appendObject_(RD_CONFIG.SHEETS.AUDIT, {
    AUDIT_ID: auditId,
    EVENT_AT: nowIso_(),
    ACTOR_EMAIL: actor.email || '',
    ACTOR_ROLE: actor.roleCode || '',
    ACTION: input.action || '',
    ENTITY_TYPE: input.entityType || '',
    ENTITY_ID: input.entityId || '',
    BEFORE_STATE: input.beforeState || '',
    AFTER_STATE: input.afterState || '',
    EVIDENCE_REF: input.evidenceRef || '',
    RESULT: input.result || 'RECORDED',
    NOTES: truncate_(input.notes || '', 45000)
  });
  const occurrences = readObjects_(RD_CONFIG.SHEETS.AUDIT)
    .filter(row => String(row.AUDIT_ID || '') === auditId).length;
  if (occurrences !== 1) throw new Error('AUDIT_ID uniqueness postcondition failed: ' + auditId + ' count=' + occurrences);
  return auditId;
}

function listDuplicateIds_() {
  const issues = [];
  Object.entries(RD_ID_TARGETS).forEach(([prefix, target]) => {
    const seen = new Map();
    readObjects_(target.sheet).forEach(row => {
      const value = String(row[target.column] || '').trim();
      if (!value) return;
      seen.set(value, (seen.get(value) || 0) + 1);
    });
    seen.forEach((count, value) => { if (count > 1) issues.push({ prefix, sheet: target.sheet, column: target.column, value, count }); });
  });
  return issues;
}

function assertNoDuplicateIds_() {
  const issues = listDuplicateIds_();
  if (issues.length) throw new Error('Duplicate IDs detected: ' + JSON.stringify(issues));
  return { ok: true, issues: [] };
}

function getCaseByRequestId_(requestId) {
  return readObjects_(RD_CONFIG.SHEETS.PORTFOLIO)
    .find(row => String(row.RD_REQUEST_ID) === String(requestId)) || null;
}

function getRequestForCase_(caseId) {
  const foundCase = findObjectById_(RD_CONFIG.SHEETS.PORTFOLIO, 'RD_CASE_ID', caseId);
  if (!foundCase) return null;
  const foundRequest = findObjectById_(RD_CONFIG.SHEETS.REQUESTS, 'RD_REQUEST_ID', foundCase.record.RD_REQUEST_ID);
  return foundRequest ? foundRequest.record : null;
}

function serializeForClient_(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => item instanceof Date ? item.toISOString() : item));
}
