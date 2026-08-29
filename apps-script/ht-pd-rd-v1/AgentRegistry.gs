/** Canonical externally-orchestrated agent roster. */
const RD_AGENT_REGISTRY = Object.freeze([
  Object.freeze({ agentId: 'BA', name: 'Business Analyst', role: 'BA', team: 'PRODUCT' }),
  Object.freeze({ agentId: 'PO', name: 'Product Owner', role: 'PO', team: 'PRODUCT' }),
  Object.freeze({ agentId: 'PM', name: 'Project Manager', role: 'PM', team: 'PRODUCT' }),
  Object.freeze({ agentId: 'CMO', name: 'Chief Marketing Officer', role: 'CMO', team: 'LEADERSHIP' }),
  Object.freeze({ agentId: 'DEV', name: 'Developer', role: 'DEV', team: 'ENGINEERING' }),
  Object.freeze({ agentId: 'CONTENT_CREATOR', name: 'Content Creator', role: 'CONTENT_CREATOR', team: 'CREATIVE' }),
  Object.freeze({ agentId: 'DESIGNER', name: 'Product / UX Designer', role: 'DESIGNER', team: 'CREATIVE' }),
  Object.freeze({ agentId: 'TESTER', name: 'Software Tester', role: 'TESTER', team: 'ENGINEERING' }),
  Object.freeze({ agentId: 'MKT_MARKET_INTELLIGENCE', name: 'Market Intelligence', role: 'MARKET_INTELLIGENCE_AGENT', team: 'MKT' }),
  Object.freeze({ agentId: 'MKT_CUSTOMER_VOC', name: 'Customer & Voice of Customer', role: 'CUSTOMER_VOC_AGENT', team: 'MKT' }),
  Object.freeze({ agentId: 'MKT_COMPETITOR_BENCHMARK', name: 'Competitor Benchmark', role: 'COMPETITOR_BENCHMARK_AGENT', team: 'MKT' }),
  Object.freeze({ agentId: 'MKT_ACQUISITION_SIGNALS', name: 'Acquisition & Demand Signals', role: 'ACQUISITION_SIGNAL_AGENT', team: 'MKT' }),
  Object.freeze({ agentId: 'MKT_SEO_INTENT', name: 'SEO & Search Intent', role: 'SEO_SEARCH_INTENT_AGENT', team: 'MKT' }),
  Object.freeze({ agentId: 'MKT_SOCIAL_LISTENING', name: 'Social Listening', role: 'SOCIAL_LISTENING_AGENT', team: 'MKT' }),
  Object.freeze({ agentId: 'MKT_PR_STRATEGY', name: 'PR & Content Strategy', role: 'PR_STRATEGY_AGENT', team: 'MKT' })
]);

function getRegisteredAgent_(agentId) {
  const id = String(agentId || '').trim().toUpperCase();
  const agent = RD_AGENT_REGISTRY.find(item => String(item.agentId) === id);
  if (!agent) throw new Error('Không tìm thấy agent: ' + id);
  return agent;
}

function getRegisteredAgentRuntime_(agentId) {
  const agent = getRegisteredAgent_(agentId);
  return Object.assign({}, agent, resolveAgentModel_(agent));
}

function listAgentModelAssignments() {
  requireTechnicalOperator_();
  return RD_AGENT_REGISTRY.map(agent => Object.assign({}, agent, resolveAgentModel_(agent)));
}
