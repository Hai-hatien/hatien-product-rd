function auditDuplicateRows_() {
  const rows = readObjects_(RD_CONFIG.SHEETS.AUDIT);
  const firstSeen = new Map();
  const duplicates = [];
  rows.forEach(row => {
    const id = String(row.AUDIT_ID || '').trim();
    if (!id) return;
    if (!firstSeen.has(id)) {
      firstSeen.set(id, row.__rowIndex);
      return;
    }
    duplicates.push({ auditId: id, firstRow: firstSeen.get(id), duplicateRow: row.__rowIndex });
  });
  return duplicates;
}

function assertAuditIdsUnique_() {
  const duplicates = auditDuplicateRows_();
  if (duplicates.length) {
    throw new Error('98_Audit_Log còn duplicate AUDIT_ID: ' + JSON.stringify(duplicates));
  }
  return { ok: true, duplicateCount: 0, rowCount: readObjects_(RD_CONFIG.SHEETS.AUDIT).length };
}

function backupAuditSheetForRepair_(actor) {
  const timestamp = Utilities.formatDate(new Date(), RD_CONFIG.TIME_ZONE, 'yyyyMMdd-HHmmss');
  const backupSs = SpreadsheetApp.create('HT-PD-RD Audit Backup ' + timestamp);
  const source = getSheet_(RD_CONFIG.SHEETS.AUDIT);
  const copied = source.copyTo(backupSs).setName('98_Audit_Log_BACKUP');
  backupSs.getSheets().forEach(sheet => {
    if (sheet.getSheetId() !== copied.getSheetId()) backupSs.deleteSheet(sheet);
  });
  return {
    spreadsheetId: backupSs.getId(),
    url: backupSs.getUrl(),
    createdBy: actor.email,
    createdAt: nowIso_()
  };
}

/**
 * UAT-only repair for historical duplicate audit IDs.
 * Existing event payloads are not rewritten; only duplicate AUDIT_ID cells after
 * the first occurrence are assigned fresh IDs. A full sheet backup is created first.
 */
function repairDuplicateAuditIdsUat() {
  const actor = requireTechnicalOperator_();
  if (RD_CONFIG.ENVIRONMENT !== 'UAT') throw new Error('Audit ID repair chỉ được phép ở UAT.');

  const before = auditDuplicateRows_();
  if (!before.length) return { ok: true, repaired: 0, duplicates: [], integrity: assertAuditIdsUnique_() };

  const backup = backupAuditSheetForRepair_(actor);
  const sheet = getSheet_(RD_CONFIG.SHEETS.AUDIT);
  const header = headers_(RD_CONFIG.SHEETS.AUDIT);
  const idCol = header.indexOf('AUDIT_ID') + 1;
  if (idCol < 1) throw new Error('98_Audit_Log thiếu cột AUDIT_ID.');

  const changes = [];
  before.forEach(item => {
    const newId = nextId_('AUD');
    sheet.getRange(item.duplicateRow, idCol).setValue(newId);
    changes.push({ row: item.duplicateRow, from: item.auditId, to: newId });
  });
  SpreadsheetApp.flush();
  const integrity = assertAuditIdsUnique_();
  const evidenceRef = 'BACKUP_SPREADSHEET:' + backup.spreadsheetId;
  const repairAuditId = appendAudit_({
    actor,
    action: 'REPAIR_DUPLICATE_AUDIT_IDS',
    entityType: 'SPREADSHEET_SHEET',
    entityId: RD_CONFIG.SHEETS.AUDIT,
    beforeState: JSON.stringify(before),
    afterState: JSON.stringify(changes),
    evidenceRef,
    result: 'RECORDED',
    notes: 'Full backup created before repair. First occurrence preserved; duplicate rows assigned fresh IDs.'
  });
  return { ok: true, repaired: changes.length, backup, changes, repairAuditId, integrity };
}
