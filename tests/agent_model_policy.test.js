const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(process.cwd(), 'apps-script', 'ht-pd-rd-v1');
const policySource = fs.readFileSync(path.join(ROOT, 'AgentModelPolicy.gs'), 'utf8');
const registrySource = fs.readFileSync(path.join(ROOT, 'AgentRegistry.gs'), 'utf8');
const retiredSource = fs.readFileSync(path.join(ROOT, 'OpenAiAgentService.gs'), 'utf8');

const context = { console, JSON, String, Number, Object, Array, Error };
vm.createContext(context);
vm.runInContext(policySource, context, { filename: 'AgentModelPolicy.gs' });
vm.runInContext(registrySource, context, { filename: 'AgentRegistry.gs' });

function route(agent) {
  return vm.runInContext(`resolveAgentModel_(${JSON.stringify(agent)})`, context);
}
function registered(agentId) {
  return vm.runInContext(`getRegisteredAgentRuntime_(${JSON.stringify(agentId)})`, context);
}

for (const role of ['BA', 'PO', 'PM', 'CMO']) {
  const actual = route({ role });
  assert.strictEqual(actual.model, 'gpt-5.6-sol', role + ' model');
  assert.strictEqual(actual.reasoningEffort, 'xhigh', role + ' reasoning');
  assert.strictEqual(actual.source, 'ROLE', role + ' source');
}

for (const role of ['DEV', 'CONTENT_CREATOR', 'DESIGNER', 'TESTER']) {
  const actual = route({ role });
  assert.strictEqual(actual.model, 'gpt-5.5', role + ' model');
  assert.strictEqual(actual.reasoningEffort, 'medium', role + ' reasoning');
  assert.strictEqual(actual.source, 'ROLE', role + ' source');
}

assert.strictEqual(route({ role: 'Content creater' }).model, 'gpt-5.5');
assert.strictEqual(route({ role: 'QA Tester' }).reasoningEffort, 'medium');

const mkt = route({ role: 'MARKET_RESEARCH_AGENT', team: 'MKT' });
assert.strictEqual(mkt.model, 'gpt-5.5');
assert.strictEqual(mkt.reasoningEffort, 'xhigh');
assert.strictEqual(mkt.source, 'TEAM');

const designerInMkt = route({ role: 'DESIGNER', team: 'MKT' });
assert.strictEqual(designerInMkt.reasoningEffort, 'medium');
assert.strictEqual(designerInMkt.source, 'ROLE');

for (const id of ['BA', 'PO', 'PM', 'CMO']) {
  assert.strictEqual(registered(id).model, 'gpt-5.6-sol');
}
for (const id of ['DEV', 'CONTENT_CREATOR', 'DESIGNER', 'TESTER']) {
  const actual = registered(id);
  assert.strictEqual(actual.model, 'gpt-5.5');
  assert.strictEqual(actual.reasoningEffort, 'medium');
}
for (const id of [
  'MKT_MARKET_INTELLIGENCE', 'MKT_CUSTOMER_VOC', 'MKT_COMPETITOR_BENCHMARK',
  'MKT_ACQUISITION_SIGNALS', 'MKT_SEO_INTENT', 'MKT_SOCIAL_LISTENING', 'MKT_PR_STRATEGY'
]) {
  const actual = registered(id);
  assert.strictEqual(actual.model, 'gpt-5.5');
  assert.strictEqual(actual.reasoningEffort, 'xhigh');
  assert.strictEqual(actual.source, 'TEAM');
}

assert.throws(() => route({ role: 'UNKNOWN_AGENT', team: 'UNKNOWN_TEAM' }), /Chưa gán model/);
assert.throws(() => registered('NO_SUCH_AGENT'), /Không tìm thấy agent/);
assert(retiredSource.includes('RETIRED_NOT_USED'));
assert(!retiredSource.includes('api.openai.com'));
assert(!retiredSource.includes('OPENAI_API_KEY'));

console.log('AGENT_MODEL_POLICY=PASS');
