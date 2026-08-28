const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(process.cwd(), 'apps-script', 'ht-pd-rd-v1');
const html = fs.readFileSync(path.join(ROOT, 'Client.html'), 'utf8');
const match = html.match(/^\s*<script>([\s\S]*)<\/script>\s*$/);
assert(match, 'Client.html must contain one script wrapper');
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
      classList: { add() {}, remove() {}, toggle() {} }
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

context.renderCases([{
  RD_CASE_ID: 'RDCASE-20260828-0001',
  CASE_TITLE: 'UAT Case',
  CURRENT_STAGE: 'M0',
  CASE_STATUS: 'M0_IN_PROGRESS',
  WORK_PRIORITY: 'P1'
}]);
const caseHtml = el('caseList').innerHTML;
assert(caseHtml.includes("onclick='loadCase(\"RDCASE-20260828-0001\")'"), 'case handler must keep JSON string inside single-quoted HTML attribute');
assert(!caseHtml.includes('onclick="loadCase("'), 'case handler has broken nested double quotes');

const decisionHtml = context.renderDecisionCard({
  cardType: 'RESEARCH_REQUEST',
  canApprove: true,
  rdCaseId: 'RDCASE-20260828-0001',
  rdRequestId: 'RDREQ-20260828-0001',
  id: 'RDREQ-20260828-0001',
  gateLabel: 'Yêu cầu nghiên cứu',
  title: 'UAT Request',
  subtitle: 'Fryer công nghiệp',
  status: 'REQUESTED'
});
assert(decisionHtml.includes("onclick='openRelatedCase(\"RDCASE-20260828-0001\")'"), 'related-case handler quoting invalid');
assert(decisionHtml.includes("onclick='approveResearchCard(\"RDREQ-20260828-0001\",\"RDREQ-20260828-0001\")'"), 'approve handler quoting invalid');
assert(!decisionHtml.includes('onclick="openRelatedCase("'), 'decision handler has broken nested double quotes');

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
