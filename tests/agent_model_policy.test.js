const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(process.cwd(), 'apps-script', 'ht-pd-rd-v1');
const policySource = fs.readFileSync(path.join(ROOT, 'AgentModelPolicy.gs'), 'utf8');
const openAiSource = fs.readFileSync(path.join(ROOT, 'OpenAiAgentService.gs'), 'utf8');

const context = { console, JSON, String, Number, Object, Array, Error };
vm.createContext(context);
vm.runInContext(policySource, context, { filename: 'AgentModelPolicy.gs' });
vm.runInContext(openAiSource, context, { filename: 'OpenAiAgentService.gs' });

function route(agent) {
  return vm.runInContext(`resolveAgentModel_(${JSON.stringify(agent)})`, context);
}

for (const role of ['BA', 'PO', 'PM', 'CMO']) {
  const actual = route({ role });
  assert.strictEqual(actual.model, 'gpt-5.6-sol', role + ' model');
  assert.strictEqual(actual.reasoningEffort, 'xhigh', role + ' reasoning');
  assert.strictEqual(actual.source, 'ROLE', role + ' source');
}

for (const role of ['DEV', 'CONTENT_CREATOR', 'DESIGNER']) {
  const actual = route({ role });
  assert.strictEqual(actual.model, 'gpt-5.5', role + ' model');
  assert.strictEqual(actual.reasoningEffort, 'medium', role + ' reasoning');
  assert.strictEqual(actual.source, 'ROLE', role + ' source');
}

const typoCreator = route({ role: 'Content creater' });
assert.strictEqual(typoCreator.model, 'gpt-5.5');
assert.strictEqual(typoCreator.reasoningEffort, 'medium');

const mkt = route({ role: 'MARKET_RESEARCH_AGENT', team: 'MKT' });
assert.strictEqual(mkt.model, 'gpt-5.5');
assert.strictEqual(mkt.reasoningEffort, 'xhigh');
assert.strictEqual(mkt.source, 'TEAM');

const mktAlias = route({ role: 'SEO_AGENT', team: 'Marketing Team' });
assert.strictEqual(mktAlias.model, 'gpt-5.5');
assert.strictEqual(mktAlias.reasoningEffort, 'xhigh');

// Explicit production roles deliberately override the generic MKT team fallback.
const designerInMkt = route({ role: 'DESIGNER', team: 'MKT' });
assert.strictEqual(designerInMkt.model, 'gpt-5.5');
assert.strictEqual(designerInMkt.reasoningEffort, 'medium');
assert.strictEqual(designerInMkt.source, 'ROLE');

assert.throws(() => route({ role: 'UNKNOWN_AGENT', team: 'UNKNOWN_TEAM' }), /Chưa gán model/);

const request = vm.runInContext(`buildOpenAiAgentRequest_(
  {role:'BA'},
  'Phân tích yêu cầu.',
  {requestId:'RDREQ-TEST'},
  {maxOutputTokens:2000, verbosity:'low'}
)`, context);
assert.strictEqual(request.model, 'gpt-5.6-sol');
assert.strictEqual(request.reasoning.effort, 'xhigh');
assert.strictEqual(request.max_output_tokens, 2000);
assert.strictEqual(request.text.verbosity, 'low');
assert.ok(request.input.includes('RDREQ-TEST'));

console.log('AGENT_MODEL_POLICY=PASS');
