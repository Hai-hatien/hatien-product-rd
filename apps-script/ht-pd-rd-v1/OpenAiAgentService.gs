/**
 * Legacy compatibility shim.
 * Runtime V1 is Gemini-only. This adapter remains fail-closed so no old caller
 * can silently route production work to a retired provider.
 */
function verifyOpenAiAgentRuntime_() {
  return { configured: false, state: 'RETIRED_NOT_USED', keyValueExposed: false };
}

function verifyOpenAiAgentRuntime() {
  requireTechnicalOperator_();
  return verifyOpenAiAgentRuntime_();
}

function runOpenAiAgent_() {
  throw new Error('Legacy agent adapter đã RETIRED_NOT_USED; scheduled R0-R8 dùng Gemini FlowWorkerService.');
}
