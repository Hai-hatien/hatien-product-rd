function runtimeConfigRows_() {
  const sheet = getSheet_(RD_CONFIG.SHEETS.RUNTIME_CONFIG);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  const headerRowIndex = values.findIndex(row =>
    row.some(cell => String(cell || '').trim() === 'CONFIG_KEY')
  );
  if (headerRowIndex < 0) {
    throw new Error('96_Runtime_Config không tìm thấy header CONFIG_KEY.');
  }

  const headers = values[headerRowIndex].map(value => String(value || '').trim());
  return values
    .slice(headerRowIndex + 1)
    .filter(row => row.some(value => value !== '' && value !== null))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function runtimeConfigByKey_() {
  const map = {};
  runtimeConfigRows_().forEach(row => {
    const key = String(row.CONFIG_KEY || '').trim();
    if (key) map[key] = row;
  });
  return map;
}

function runtimeConfigValue_(key) {
  const row = runtimeConfigByKey_()[key];
  return row ? String(row['GIÁ TRỊ / TRẠNG THÁI ANH HẢI ĐIỀN'] || '') : '';
}

function verifyCanonicalRuntimeConfig_() {
  const byKey = runtimeConfigByKey_();
  const value = key => byKey[key] ? String(byKey[key]['GIÁ TRỊ / TRẠNG THÁI ANH HẢI ĐIỀN'] || '') : '';
  const checks = [
    { name: 'canonical repository', ok: value('CANONICAL_REPOSITORY') === RD_CANONICAL.REPOSITORY, actual: value('CANONICAL_REPOSITORY') },
    { name: 'canonical branch', ok: value('CANONICAL_BRANCH') === RD_CANONICAL.BRANCH, actual: value('CANONICAL_BRANCH') },
    { name: 'Apps Script ID coordinate', ok: value('APPS_SCRIPT_SCRIPT_ID') === RD_CANONICAL.APPS_SCRIPT_ID, actual: value('APPS_SCRIPT_SCRIPT_ID') },
    { name: 'existing deployment coordinate', ok: value('APPS_SCRIPT_DEPLOYMENT_ID') === RD_CANONICAL.EXISTING_DEPLOYMENT_ID, actual: value('APPS_SCRIPT_DEPLOYMENT_ID') },
    { name: 'Gemini provider', ok: value('MODEL_PROVIDER') === 'GEMINI' && value('AI_PROVIDER') === 'GEMINI', actual: value('MODEL_PROVIDER') + '|' + value('AI_PROVIDER') },
    { name: 'legacy OpenAI retired', ok: value('LEGACY_OPENAI_STATUS') === 'RETIRED_NOT_USED', actual: value('LEGACY_OPENAI_STATUS') },
    { name: 'backend gate not falsely ready', ok: value('BACKEND_READY') !== 'TRUE', actual: value('BACKEND_READY') }
  ];
  return { ok: checks.every(check => check.ok), checks, missing: checks.filter(check => !check.ok).map(check => check.name) };
}

function verifyGeminiRuntime_() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = String(props.getProperty(RD_CONFIG.GEMINI.API_KEY_PROPERTY) || '');
  const model = String(props.getProperty(RD_CONFIG.GEMINI.MODEL_PROPERTY) || RD_CONFIG.GEMINI.DEFAULT_MODEL || '');
  return {
    configured: Boolean(apiKey),
    model,
    keyProperty: RD_CONFIG.GEMINI.API_KEY_PROPERTY,
    keyValueExposed: false
  };
}

function verifyAppsScriptCoordinate_() {
  const actualScriptId = String(ScriptApp.getScriptId() || '');
  const serviceUrl = String(ScriptApp.getService().getUrl() || '');
  return {
    scriptIdMatches: actualScriptId === RD_CANONICAL.APPS_SCRIPT_ID,
    actualScriptId,
    serviceUrl,
    existingDeploymentCoordinatePresent: serviceUrl.includes(RD_CANONICAL.EXISTING_DEPLOYMENT_ID),
    canonicalDeployProven: false
  };
}

function verifyRuntimePrerequisites() {
  const actor = requireTechnicalOperator_();
  const canonicalConfig = verifyCanonicalRuntimeConfig_();
  const gemini = verifyGeminiRuntime_();
  const appsScript = verifyAppsScriptCoordinate_();
  const flowSchedule = validateFlowSchedule_();
  const triggers = triggerRuntimeSnapshot_();
  let idIntegrity;
  try {
    idIntegrity = assertNoDuplicateIds_();
  } catch (error) {
    idIntegrity = { ok: false, error: error.message };
  }
  const checks = {
    canonicalConfig: canonicalConfig.ok,
    geminiApiKey: gemini.configured,
    appsScriptId: appsScript.scriptIdMatches,
    flowSchedule: flowSchedule.ok,
    triggersInstalled: triggers.installed,
    idIntegrity: Boolean(idIntegrity.ok)
  };
  const ready = Object.values(checks).every(Boolean);
  const auditId = appendAudit_({
    actor,
    action: 'VERIFY_RUNTIME_PREREQUISITES',
    entityType: 'APPS_SCRIPT',
    entityId: RD_CONFIG.PROJECT_CODE,
    beforeState: 'UNVERIFIED',
    afterState: ready ? 'PREREQUISITES_VERIFIED' : 'PREREQUISITES_INCOMPLETE',
    evidenceRef: triggers.triggers.map(t => t.triggerId).join('|'),
    result: ready ? 'RECORDED' : 'NEEDS_ACTION',
    notes: JSON.stringify({ checks, canonicalConfig, gemini: { configured: gemini.configured, model: gemini.model }, appsScript, flowSchedule, triggers, idIntegrity })
  });
  return {
    ok: ready,
    status: ready ? 'PREREQUISITES_VERIFIED' : 'PENDING_PREREQUISITES',
    checks,
    canonicalConfig,
    gemini,
    appsScript,
    flowSchedule,
    triggers,
    idIntegrity,
    auditId,
    note: 'PENDING/ENABLED không được gọi RUNNING; canonicalDeployProven vẫn FALSE cho đến clasp push/deployment proof.'
  };
}
