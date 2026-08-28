/**
 * Agent model policy for HT-PD-RD.
 *
 * User-facing labels such as "Extra high" are normalized to the OpenAI API
 * reasoning.effort value "xhigh".
 *
 * Resolution precedence is intentional:
 *   1) Explicit role mapping (BA/PO/PM/CMO/DEV/CONTENT_CREATOR/DESIGNER)
 *   2) Team fallback (MKT)
 *
 * This prevents a generic team label from silently changing a deliberately
 * assigned production role. If a Content Creator or Designer should use the
 * MKT xhigh profile, register that agent with an MKT-specific role instead of
 * the generic production role.
 */
const RD_AGENT_MODEL_POLICY = Object.freeze({
  provider: 'OPENAI',
  api: 'RESPONSES',
  roleProfiles: Object.freeze({
    BA: Object.freeze({ model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' }),
    PO: Object.freeze({ model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' }),
    PM: Object.freeze({ model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' }),
    CMO: Object.freeze({ model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' }),
    DEV: Object.freeze({ model: 'gpt-5.5', reasoningEffort: 'medium' }),
    CONTENT_CREATOR: Object.freeze({ model: 'gpt-5.5', reasoningEffort: 'medium' }),
    DESIGNER: Object.freeze({ model: 'gpt-5.5', reasoningEffort: 'medium' })
  }),
  teamProfiles: Object.freeze({
    MKT: Object.freeze({ model: 'gpt-5.5', reasoningEffort: 'xhigh' })
  }),
  allowedEfforts: Object.freeze(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
});

function normalizeAgentRole_(value) {
  const raw = String(value || '').trim().toUpperCase();
  const compact = raw.replace(/[\s\-\/]+/g, '_');
  const aliases = {
    BUSINESS_ANALYST: 'BA',
    PRODUCT_OWNER: 'PO',
    PRODUCT_MANAGER: 'PM',
    CHIEF_MARKETING_OFFICER: 'CMO',
    DEVELOPER: 'DEV',
    CONTENT_CREATER: 'CONTENT_CREATOR',
    CONTENT_CREATOR: 'CONTENT_CREATOR',
    CREATOR: 'CONTENT_CREATOR',
    UI_DESIGNER: 'DESIGNER',
    UX_DESIGNER: 'DESIGNER',
    UI_UX_DESIGNER: 'DESIGNER'
  };
  return aliases[compact] || compact;
}

function normalizeAgentTeam_(value) {
  const raw = String(value || '').trim().toUpperCase();
  const compact = raw.replace(/[\s\-\/]+/g, '_');
  const aliases = {
    MARKETING: 'MKT',
    MARKETING_TEAM: 'MKT',
    TEAM_MKT: 'MKT'
  };
  return aliases[compact] || compact;
}

function resolveAgentModel_(agent) {
  agent = agent || {};
  const role = normalizeAgentRole_(agent.role || agent.roleCode || agent.agentRole);
  const team = normalizeAgentTeam_(agent.team || agent.teamCode || agent.agentTeam);

  const roleProfile = RD_AGENT_MODEL_POLICY.roleProfiles[role];
  const teamProfile = RD_AGENT_MODEL_POLICY.teamProfiles[team];
  const selected = roleProfile || teamProfile;

  if (!selected) {
    throw new Error('Chưa gán model cho agent. role=' + (role || 'UNKNOWN') + ', team=' + (team || 'UNKNOWN'));
  }
  if (!RD_AGENT_MODEL_POLICY.allowedEfforts.includes(selected.reasoningEffort)) {
    throw new Error('reasoningEffort không hợp lệ: ' + selected.reasoningEffort);
  }

  return {
    provider: RD_AGENT_MODEL_POLICY.provider,
    api: RD_AGENT_MODEL_POLICY.api,
    model: selected.model,
    reasoningEffort: selected.reasoningEffort,
    role: role || '',
    team: team || '',
    source: roleProfile ? 'ROLE' : 'TEAM'
  };
}

function getAgentModelPolicySnapshot() {
  requireTechnicalOperator_();
  return {
    provider: RD_AGENT_MODEL_POLICY.provider,
    api: RD_AGENT_MODEL_POLICY.api,
    roleProfiles: RD_AGENT_MODEL_POLICY.roleProfiles,
    teamProfiles: RD_AGENT_MODEL_POLICY.teamProfiles,
    precedence: ['ROLE', 'TEAM'],
    note: 'Extra high = xhigh trong OpenAI Responses API.'
  };
}
