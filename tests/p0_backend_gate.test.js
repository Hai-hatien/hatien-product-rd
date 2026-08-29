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
  "'R1.1': 'M0:CONFIRMED'",
  "'R2.1': 'M0:CONFIRMED'",
  "'R3.1': 'M0:CONFIRMED'",
  "'R4.1': 'R1.5|R2.6|R3.6|GATE:M4'",
  'releaseResearchFanoutAfterM0_',
  'gateCoverage_',
  'if (positive && !coverage.ready)'
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
  'M0:CONFIRMED',
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

mustContain('FlowWorkerService.gs', [
  'callGeminiFlowWorker_',
  "headers: { 'x-goog-api-key': runtime.apiKey }",
  "responseMimeType: 'application/json'",
  "STATUS: 'HANDOFF_READY'",
  "IMPORT_STATUS: 'REPORT_ONLY_V1'",
  'Kế hoạch HTG - STG - HTC 2026'
]);
mustNotContain('FlowWorkerService.gs', ["STATUS: 'COMPLETED'", 'GATE_APPROVED']);

mustContain('AutomationService.gs', [
  'runScheduledFlowWorker_',
  "runR1Scheduled()",
  "runR2Scheduled()",
  "runR3Scheduled()",
  "runR4Scheduled()",
  "runR5Scheduled()",
  "runR6Scheduled()",
  "runR7Scheduled()",
  "runR8Scheduled()",
  'runR0DailySummary()',
  "apiStatus = completed.length ? 'CALLED' : 'CALL_FAILED'",
  "nextFlow: 'HUMAN_REVIEW_REQUIRED'"
]);
mustNotContain('AutomationService.gs', ['WORKER_EXECUTION_REQUIRED', 'runScheduledFlowProbe_']);

mustContain('OpenAiAgentService.gs', ['RETIRED_NOT_USED']);
mustNotContain('OpenAiAgentService.gs', ['OPENAI_API_KEY', 'api.openai.com']);

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

mustContain('DashboardService.gs', ['getBootstrapData', 'getKpis_', 'getRuntimeStatusForUi_', 'getCaseDetail']);
mustContain('Code.gs', ['function doGet()', 'function include_']);
mustContain('Index.html', ["include_('Styles')", "include_('Client')", 'Hôm nay cần quyết gì?']);

const deploy = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'apps-script-deploy.yml'), 'utf8');
assert(deploy.includes("test -f .backend-uat-deploy-ready"), 'deploy must fail closed without backend marker');
assert(deploy.includes('workflow_dispatch'), 'canonical deployment must retain explicit manual dispatch');
assert(deploy.includes("- '.backend-uat-deploy-ready'"), 'push deploy trigger must be scoped only to backend UAT marker');
assert(deploy.includes("APPS_SCRIPT_ID: '1TGVEpC82jSws4y6lzl2vHSZ8Z8H0dkHhUFLY5_oPaSdCbY7e4knbqsfL'"), 'deploy must use verified lowercase-l Script ID');
assert(deploy.includes('TARGET_OWNERSHIP_PRECHECK=PASS'), 'deploy must verify target deployment ownership before mutation');
assert(deploy.includes('FlowWorkerService.gs'), 'deploy must require the Gemini worker');
assert(deploy.includes("find remote-script -maxdepth 1 -type f -name '*.js' -delete"), 'post-backend release deploy must rebuild canonical JS package');
assert(deploy.includes('cp "$ROOT_DIR/Index.html" remote-script/Index.html'), 'canonical UI Index must be deployed');
assert(deploy.includes('cp "$ROOT_DIR/Client.html" remote-script/Client.html'), 'canonical UI Client must be deployed');
assert(deploy.includes('cp "$ROOT_DIR/Styles.html" remote-script/Styles.html'), 'canonical UI Styles must be deployed');
assert(deploy.includes('CANONICAL_MOBILE_UX_DEPLOYED=YES'), 'deploy evidence must state canonical mobile UX deployment');

const uiPreview = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'apps-script-ui-preview.yml'), 'utf8');
assert(uiPreview.includes('FROZEN BY BACKEND P0'), 'legacy preview workflow remains non-mutating');
assert(!uiPreview.includes('clasp push'), 'legacy preview workflow must not push');

console.log('P0 backend gate source contracts: PASS');
