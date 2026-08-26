const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..', 'apps-script', 'ht-pd-rd-v1');

function load(files, extra = {}) {
  const sandbox = Object.assign({ console, Object, String, Boolean, Array, Set, Map, JSON, RegExp, Number, Math }, extra);
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
  return sandbox;
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (error) {
    console.error('FAIL', name, '-', error.message);
    process.exitCode = 1;
  }
}

const flow = load(['Config.gs', 'WorkflowService.gs']);
vm.runInContext('globalThis.__deps = RD_FLOW_DEPENDENCIES; globalThis.__gates = RD_GATE_DEFINITIONS;', flow);

test('R1/R2/R3 all wait on explicit M0 confirmation', () => {
  assert.equal(flow.__deps['R1.1'], 'M0:CONFIRMED');
  assert.equal(flow.__deps['R2.1'], 'M0:CONFIRMED');
  assert.equal(flow.__deps['R3.1'], 'M0:CONFIRMED');
  assert.equal(flow.initialTaskStatus_('R1.1', 'CONFIRMED_BY_HAI'), 'WAITING_DEPENDENCY');
  assert.equal(flow.initialTaskStatus_('R2.1', 'CONFIRMED_BY_HAI'), 'WAITING_DEPENDENCY');
  assert.equal(flow.initialTaskStatus_('R3.1', 'CONFIRMED_BY_HAI'), 'WAITING_DEPENDENCY');
});

test('R2 and R3 are not serialized behind R1', () => {
  assert(!String(flow.__deps['R2.1']).includes('R1'));
  assert(!String(flow.__deps['R3.1']).includes('R1'));
});

test('R5 and R6 fan out after approved concept', () => {
  assert.equal(flow.__deps['R5.1'], 'R4.7|GATE:CONCEPT');
  assert.equal(flow.__deps['R6.1'], 'R4.7|GATE:CONCEPT');
});

test('M4 positive decision is evidence-gated', () => {
  assert(flow.__gates.M4_GATE.allowed.includes('GO_CONCEPT'));
  const source = fs.readFileSync(path.join(root, 'WorkflowService.gs'), 'utf8');
  assert(source.includes("researchComplete"));
  assert(source.includes("verifiedBenchmark.length >= 3"));
  assert(source.includes("trustedVoc.length > 0"));
  assert(source.includes("verifiedMarket.length > 0"));
  assert(source.includes("if (positive && !coverage.ready)"));
});

test('Positive M4 decision rejects generically when evidence coverage is not ready', () => {
  flow.requirePermission_ = () => ({ email: 'gpt@hatiencorp.vn', permissions: { approveGate: true } });
  flow.assertRequired_ = () => {};
  flow.assertIn_ = () => {};
  flow.findObjectById_ = () => ({ record: { M4_DECISION: '' } });
  flow.gateCoverage_ = () => ({
    ready: false,
    missing: ['Market evidence đã xác minh'],
    checks: [{ name: 'Market evidence đã xác minh', ok: false }],
    evidenceSummary: {}
  });
  assert.throws(
    () => flow.submitGateDecision({ gateType: 'M4_GATE', rdCaseId: 'RDCASE-UAT', decision: 'GO_CONCEPT' }),
    error => /Chưa đủ bằng chứng/.test(String(error && error.message)) && /M4_GATE/.test(String(error && error.message))
  );
});

test('Final handover is only approved by finalApprove and leaves Product identities blank', () => {
  assert.equal(flow.__gates.FINAL_HANDOVER.permission, 'finalApprove');
  const source = fs.readFileSync(path.join(root, 'WorkflowService.gs'), 'utf8');
  for (const field of ['PRODUCT_ID', 'PRODUCT_FAMILY_CODE', 'PRODUCT_TYPE_CODE', 'CANONICAL_MODEL', 'MARKET_VARIANT', 'SELLABLE_SKU']) {
    assert(source.includes(field + ": ''"));
  }
});

function actorFor(email, environment = 'UAT') {
  const sandbox = load(['Config.gs', 'AuthService.gs'], {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) }
  });
  // Environment is constant in canonical UAT source; this argument documents the expected mode.
  assert.equal(environment, 'UAT');
  return sandbox.getActorContext_();
}

test('Unknown user fails closed', () => {
  const actor = actorFor('unknown@example.com');
  assert.equal(actor.allowed, false);
});

test('MKT can create request but cannot set priority or approve gates', () => {
  const actor = actorFor('youtube1@hatiencorp.vn');
  assert.equal(actor.allowed, true);
  assert.equal(actor.permissions.createRequest, true);
  assert.equal(actor.permissions.setPriority, false);
  assert.equal(actor.permissions.approveGate, false);
  assert.equal(actor.permissions.finalApprove, false);
});

test('CMO keeps technical/gate permission and gets explicit TEMP_UAT Hải proxy only in UAT', () => {
  const actor = actorFor('gpt@hatiencorp.vn');
  assert.equal(actor.allowed, true);
  assert.equal(actor.permissions.technicalOperate, true);
  assert.equal(actor.permissions.approveGate, true);
  assert.equal(actor.uatHaiProxy, true);
  assert.equal(actor.permissions.setPriority, true);
  assert.equal(actor.permissions.finalApprove, true);
});

test('Canonical config is Gemini-only and has no OpenAI runtime', () => {
  const configSource = fs.readFileSync(path.join(root, 'Config.gs'), 'utf8');
  assert(configSource.includes('GEMINI'));
  assert(!configSource.includes('OPENAI'));
  assert(!configSource.includes('runDailyRdOrchestrator'));
});

if (!process.exitCode) console.log('BACKEND_BEHAVIOR_TESTS=PASS');
