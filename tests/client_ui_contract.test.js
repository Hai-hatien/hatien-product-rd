const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(process.cwd(), 'apps-script', 'ht-pd-rd-v1');
const html = fs.readFileSync(path.join(ROOT, 'Client.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
const match = html.match(/^\s*<script>([\s\S]*)<\/script>\s*$/);
assert(match, 'Client.html must contain one script wrapper');
assert(indexHtml.includes('id="requestDetail"'), 'Index must expose requestDetail target');
const js = match[1];

// Parse exactly the browser-side JavaScript before deployment.
new vm.Script(js, { filename: 'Client.html' });

const elements = new Map();
function el(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      innerHTML: '',
      textContent: '',
      className: '',
      value: '',
      classList: { add() {}, remove() {}, toggle() {} },
      scrollIntoView() {}
    });
  }
  return elements.get(id);
}

const context = {
  console,
  Promise,
  JSON,
  String,
  Number,
  Boolean,
  Object,
  Array,
  document: {
    addEventListener() {},
    getElementById: el,
    querySelectorAll() { return []; },
    querySelector() { return el('query'); }
  },
  window: {
    scrollTo() {},
    prompt() { return ''; },
    confirm() { return true; }
  },
  google: { script: { run: {} } },
  FormData: class { entries() { return []; } }
};
vm.createContext(context);
vm.runInContext(js, context, { filename: 'Client.html' });
vm.runInContext(`appData = {
  actor: { permissions: { setPriority: true, assignFamily: true, approveGate: true } },
  requests: [{
    RD_REQUEST_ID: 'RDREQ-20260828-0001',
    REQUEST_TITLE: 'UAT Request',
    REQUEST_STATUS: 'REQUESTED',
    TARGET_PRODUCT: 'Fryer công nghiệp',
    TARGET_MARKET: 'VN',
    TARGET_CUSTOMER: 'Bếp trung tâm',
    CUSTOMER_PAIN: 'Hồi nhiệt chậm',
    TARGET_OUTCOMES: 'Hồi nhiệt nhanh',
    CONSTRAINTS: 'CHƯA BIẾT',
    WORK_PRIORITY: '',
    SOURCE_URL_OR_FILE: ''
  }],
  decisionCards: []
}`, context);

context.renderCases([{
  RD_CASE_ID: 'RDCASE-20260828-0001',
  CASE_TITLE: 'UAT Case',
  CURRENT_STAGE: 'M0',
  CASE_STATUS: 'M0_IN_PROGRESS',
  WORK_PRIORITY: 'P1'
}]);
const caseHtml = el('caseList').innerHTML;
assert(caseHtml.includes("onclick='loadCase(\"RDCASE-20260828-0001\")'"), 'case handler quoting invalid');
assert(!caseHtml.includes('onclick="loadCase("'), 'case handler has broken nested double quotes');

const requestDecisionHtml = context.renderDecisionCard({
  cardType: 'RESEARCH_REQUEST',
  canApprove: true,
  canSetPriority: true,
  rdCaseId: '',
  rdRequestId: 'RDREQ-20260828-0001',
  id: 'RDREQ-20260828-0001',
  gateLabel: 'Yêu cầu nghiên cứu',
  title: 'UAT Request',
  subtitle: 'Fryer công nghiệp',
  status: 'REQUESTED'
});
assert(requestDecisionHtml.includes("openRequestDetail(\"RDREQ-20260828-0001\")"), 'request decision must open request detail instead of dead case action');
assert(requestDecisionHtml.includes('Duyệt nghiên cứu'), 'research request must expose approve action');

const openResearchGateHtml = context.renderDecisionCard({
  cardType: 'OPEN_DECISION',
  canApprove: true,
  decisionType: 'RESEARCH_GATE',
  decisionId: 'DEC-20260828-0100',
  rdCaseId: '',
  rdRequestId: 'RDREQ-20260828-0001',
  id: 'DEC-20260828-0100',
  gateLabel: 'Quyết định mở',
  title: 'UAT Request',
  subtitle: 'RESEARCH_GATE',
  status: 'WAITING_AUTHORIZED_APPROVAL'
});
assert(openResearchGateHtml.includes("openRequestDetail(\"RDREQ-20260828-0001\")"), 'open RESEARCH_GATE must open linked request');
assert(openResearchGateHtml.includes("approveResearchOpenDecision(\"RDREQ-20260828-0001\")"), 'open RESEARCH_GATE must expose approve action');

const m0Html = context.renderDecisionCard({
  cardType: 'OPEN_DECISION',
  canApprove: true,
  decisionType: 'M0_INPUT_CONFIRMATION',
  decisionId: 'DEC-20260828-0101',
  rdCaseId: 'RDCASE-20260828-0001',
  rdRequestId: 'RDREQ-20260828-0001',
  id: 'DEC-20260828-0101',
  status: 'WAITING_AUTHORIZED_APPROVAL'
});
assert(m0Html.includes("confirmM0(\"DEC-20260828-0101\")"), 'M0 card must expose confirmation action');

const priorityHtml = context.renderDecisionCard({
  cardType: 'OPEN_DECISION',
  canApprove: true,
  decisionType: 'WORK_PRIORITY_SELECTION',
  decisionId: 'DEC-20260828-0102',
  rdCaseId: '',
  rdRequestId: 'RDREQ-20260828-0001',
  id: 'DEC-20260828-0102',
  status: 'WAITING_AUTHORIZED_APPROVAL'
});
assert(priorityHtml.includes('open-priority-DEC-20260828-0102'), 'priority card must expose priority selector');
assert(priorityHtml.includes('resolvePriorityDecision'), 'priority card must expose confirm action');

const familyHtml = context.renderDecisionCard({
  cardType: 'OPEN_DECISION',
  canApprove: true,
  decisionType: 'FAMILY_SCOPE_CONFIRMATION',
  decisionId: 'DEC-20260828-0103',
  rdCaseId: '',
  rdRequestId: 'RDREQ-20260828-0001',
  id: 'DEC-20260828-0103',
  status: 'WAITING_AUTHORIZED_APPROVAL'
});
assert(familyHtml.includes('resolveFamilyDecision'), 'family card must expose confirmation action');

context.openRequestDetail('RDREQ-20260828-0001');
const detailHtml = el('requestDetail').innerHTML;
assert(detailHtml.includes('UAT Request'), 'request detail must render title');
assert(detailHtml.includes('Hồi nhiệt chậm'), 'request detail must render pain');
assert(detailHtml.includes('Fryer công nghiệp'), 'request detail must render product scope');

const candidateHtml = context.renderCandidate({
  rdCaseId: 'RDCASE-20260828-0001',
  origin: 'AI',
  stage: 'R1',
  title: 'UAT Candidate',
  customer: 'UAT',
  pain: 'UAT',
  value: 'UAT',
  evidenceCount: 1
});
assert(candidateHtml.includes("onclick='loadCase(\"RDCASE-20260828-0001\")'"), 'candidate handler quoting invalid');
assert(!candidateHtml.includes('onclick="loadCase("'), 'candidate handler has broken nested double quotes');

console.log('CLIENT_UI_CONTRACT=PASS');
