/**
 * OpenAI execution adapter for role-routed R&D agents.
 *
 * Secret contract:
 *   ScriptProperties.RD_AGENT_OPENAI_API_KEY
 *
 * The key is never returned to the client, Sheet, audit notes, or logs.
 */
const RD_OPENAI_AGENT_CONFIG = Object.freeze({
  API_KEY_PROPERTY: 'RD_AGENT_OPENAI_API_KEY',
  ENDPOINT: 'https://api.openai.com/v1/responses',
  DEFAULT_VERBOSITY: 'medium',
  DEFAULT_MAX_OUTPUT_TOKENS: 12000
});

function verifyOpenAiAgentRuntime_() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = String(props.getProperty(RD_OPENAI_AGENT_CONFIG.API_KEY_PROPERTY) || '').trim();
  return {
    configured: Boolean(apiKey),
    keyProperty: RD_OPENAI_AGENT_CONFIG.API_KEY_PROPERTY,
    keyValueExposed: false,
    endpoint: RD_OPENAI_AGENT_CONFIG.ENDPOINT
  };
}

function verifyOpenAiAgentRuntime() {
  requireTechnicalOperator_();
  return verifyOpenAiAgentRuntime_();
}

function buildOpenAiAgentRequest_(agent, instructions, input, options) {
  options = options || {};
  const route = resolveAgentModel_(agent);
  const maxOutputTokens = Number(options.maxOutputTokens || RD_OPENAI_AGENT_CONFIG.DEFAULT_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 1) {
    throw new Error('maxOutputTokens không hợp lệ.');
  }
  return {
    model: route.model,
    reasoning: { effort: route.reasoningEffort },
    instructions: String(instructions || '').trim(),
    input: typeof input === 'string' ? input : JSON.stringify(input == null ? {} : input),
    text: { verbosity: String(options.verbosity || RD_OPENAI_AGENT_CONFIG.DEFAULT_VERBOSITY) },
    max_output_tokens: Math.floor(maxOutputTokens)
  };
}

function extractOpenAiResponseText_(data) {
  if (!data) return '';
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data.output) ? data.output : [];
  const texts = [];
  output.forEach(item => {
    if (!item || !Array.isArray(item.content)) return;
    item.content.forEach(part => {
      if (!part) return;
      if (typeof part.text === 'string' && part.text.trim()) texts.push(part.text.trim());
      else if (part.text && typeof part.text.value === 'string' && part.text.value.trim()) texts.push(part.text.value.trim());
    });
  });
  return texts.join('\n\n').trim();
}

function runOpenAiAgent_(agent, instructions, input, options) {
  const runtime = verifyOpenAiAgentRuntime_();
  if (!runtime.configured) {
    throw new Error('Chưa cấu hình Script Property ' + runtime.keyProperty + ' cho agent OpenAI.');
  }

  const route = resolveAgentModel_(agent);
  const payload = buildOpenAiAgentRequest_(agent, instructions, input, options);
  const apiKey = String(PropertiesService.getScriptProperties().getProperty(RD_OPENAI_AGENT_CONFIG.API_KEY_PROPERTY) || '').trim();
  const startedAt = nowIso_();
  const response = UrlFetchApp.fetch(RD_OPENAI_AGENT_CONFIG.ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const statusCode = response.getResponseCode();
  const raw = response.getContentText();
  let data = null;
  try { data = JSON.parse(raw); } catch (error) {}

  if (statusCode < 200 || statusCode >= 300) {
    const safeMessage = data && data.error && data.error.message ? String(data.error.message) : ('HTTP ' + statusCode);
    throw new Error('OpenAI agent call failed: ' + safeMessage);
  }

  return {
    ok: true,
    provider: route.provider,
    model: route.model,
    reasoningEffort: route.reasoningEffort,
    role: route.role,
    team: route.team,
    responseId: data && data.id ? String(data.id) : '',
    outputText: extractOpenAiResponseText_(data),
    startedAt,
    finishedAt: nowIso_(),
    usage: data && data.usage ? data.usage : null
  };
}
