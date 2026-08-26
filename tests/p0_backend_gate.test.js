const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(process.cwd(), 'apps-script', 'ht-pd-rd-v1');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const allGs = fs.readdirSync(ROOT).filter(f => f.endsWith('.gs')).map(read).join('\n');

function mustContain(file, fragments) {
  const text = read(file);
  fragments.forEach(fragment => assert(text.includes(fragment), `${file} missing contract: ${fragment}`));
}

function mustNotContain(file, fragments) {
  const text = read(file);
  fragments.forEach(fragment => assert(!text.includes(fragment), `${file} contains forbidden runtime drift: ${fragment}`));
}

assert(allGs.includes("REPOSITORY: 'Hai-hatien/hatien-product-rd'"), 'canonical repository lock missing');
assert(allGs.includes("BRANCH: 'backend/v1.3-hardening'"), 'canonical branch lock missing');
assert(!allGs.includes('Hai-hatien/hatien-digital-platform'), 'legacy repo must not appear in canonical Apps Script runtime source');

mustContain('Config.gs', [
  "API_KEY_PROPERTY: 'GEMINI_API_KEY'",
  "MODEL_PROPERTY: 'GEMINI_MODEL'",
  "RESEARCH_FLOWS: Object.freeze(['R1', 'R2', 'R3'])",
  "TEMP_UAT_HAI_PROXY_EMAILS: Object.freeze(['gpt@hatiencorp.vn'])"
]);
mustNotContain('Config.gs', ['OPENAI_API_KEY', 'api.openai.com']);

mustContain('WorkflowService.gs', [
  "subflowId: 'R1.1'",
  "subflowId: 'R2.1'",
  "subflowId: 'R3.1'",
  "dependsOn: 'M0:CONFIRMED'",
  "Chưa đủ bằng chứng để GO_CONCEPT"
]);

mustContain('Core.gs', [
  'RD_APPEND_ONLY_SHEETS',
  "RD_CONFIG.SHEETS.DECISIONS",
  "RD_CONFIG.SHEETS.AUDIT",
  'assertMutableSheet_',
  'AUDIT_ID collision trước append',
  'AUDIT_ID uniqueness postcondition failed'
]);

mustContain('AuditIntegrityService.gs', [
  'backupAuditSheetForRepair_',
  'repairDuplicateAuditIdsUat',
  'assertAuditIdsUnique_'
]);

mustContain('FlowScheduleService.gs', [
  "['R1', 'R2', 'R3']",
  "M0:CONFIRMED",
  'triggerRuntimeSnapshot_',
  'PENDING_INSTALL',
  'INSTALLED'
]);

mustContain('MarketScoutService.gs', [
  'candidateDedupKey_',
  'PROVENANCE_JSON',
  'DEDUP_MERGED',
  'runMarketScoutCandidateCycleUat',
  "FLOW_ID: 'MARKET_SCOUT'"
]);

mustContain('RuntimeConfigService.gs', [
  'verifyCanonicalRuntimeConfig_',
  'verifyGeminiRuntime_',
  'verifyAppsScriptCoordinate_',
  'verifyRuntimePrerequisites'
]);

mustContain('UatBackendTestService.gs', [
  'permission matrix ht/gpt/youtube1/unknown fail-closed',
  'create request',
  'set priority append-only decision chain',
  'M0 confirmation releases R1/R2/R3 simultaneously',
  'M4 weak-evidence positive decision rejected',
  'final handover rejected without full evidence',
  'MARKET_SIGNAL→RD_CANDIDATE provenance + dedup + run log',
  'decision and audit generic updates are blocked',
  'audit IDs globally unique after writes',
  'decision/audit evidence traceability',
  "FLOW_ID: 'BACKEND_UAT_GATE'"
]);

const deploy = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'apps-script-deploy.yml'), 'utf8');
assert(deploy.includes("test -f .backend-uat-deploy-ready"), 'deploy must fail closed without backend marker');
assert(deploy.includes('workflow_dispatch'), 'canonical deployment must be manual during P0 gate');
assert(!/\npush\s*:/.test(deploy), 'canonical deployment must not auto-push during P0 gate');

const uiPreview = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'apps-script-ui-preview.yml'), 'utf8');
assert(uiPreview.includes('FROZEN BY BACKEND P0'), 'UI preview must remain frozen');
assert(!uiPreview.includes('clasp push'), 'frozen UI preview must not contain a push step');

console.log('P0 backend gate source contracts: PASS');
