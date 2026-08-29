const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(process.cwd(), 'apps-script', 'ht-pd-rd-v1');
const worker = fs.readFileSync(path.join(root, 'FlowWorkerService.gs'), 'utf8');
const automation = fs.readFileSync(path.join(root, 'AutomationService.gs'), 'utf8');
const legacy = fs.readFileSync(path.join(root, 'OpenAiAgentService.gs'), 'utf8');

for (const flow of ['R0','R1','R2','R3','R4','R5','R6','R7','R8']) {
  assert(worker.includes(flow + ':'), 'worker profile missing ' + flow);
}
assert(worker.includes("headers: { 'x-goog-api-key': runtime.apiKey }"), 'Gemini key must use header');
assert(worker.includes("responseMimeType: 'application/json'"), 'worker must request structured JSON');
assert(worker.includes("STATUS: 'HANDOFF_READY'"), 'worker must stop at human handoff');
assert(worker.includes("IMPORT_STATUS: 'REPORT_ONLY_V1'"), 'V1 must not auto-import records');
assert(worker.includes('Kế hoạch HTG - STG - HTC 2026'), 'product-code source lock missing');
assert(!worker.includes("STATUS: 'COMPLETED'"), 'worker must not auto-complete product work');
assert(!worker.includes('GATE_APPROVED'), 'worker must not auto-approve gates');

assert(automation.includes('runScheduledFlowWorker_'));
assert(automation.includes("apiStatus = completed.length ? 'CALLED' : 'CALL_FAILED'"));
assert(automation.includes("nextFlow: 'HUMAN_REVIEW_REQUIRED'"));
assert(!automation.includes('WORKER_EXECUTION_REQUIRED'));
assert(!automation.includes('runScheduledFlowProbe_'));

assert(legacy.includes('RETIRED_NOT_USED'));
assert(!legacy.includes('api.openai.com'));
assert(!legacy.includes('OPENAI_API_KEY'));

console.log('GEMINI_FLOW_WORKER_CONTRACTS=PASS');
