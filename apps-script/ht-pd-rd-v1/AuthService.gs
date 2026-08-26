function isUatHaiProxyEmail_(email) {
  return RD_CONFIG.ENVIRONMENT === 'UAT' &&
    RD_CONFIG.TEMP_UAT_HAI_PROXY_EMAILS.includes(String(email || '').trim().toLowerCase());
}

function getActorContextForEmail_(emailInput) {
  const email = String(emailInput || '').trim().toLowerCase();
  if (!email) {
    return { email: '', displayName: 'Unknown', roleCode: 'NO_IDENTITY', permissions: {}, allowed: false,
      reason: 'Không xác định được email Workspace; hệ thống fail-closed.' };
  }
  const user = RD_CONFIG.ALLOWED_USERS[email];
  if (!user) {
    return { email, displayName: email, roleCode: 'VIEWER', permissions: {}, allowed: false,
      reason: 'Tài khoản chưa nằm trong danh sách được cấp quyền.' };
  }
  const uatHaiProxy = isUatHaiProxyEmail_(email);
  return {
    email,
    displayName: uatHaiProxy ? 'CMO / R&D Coordinator — TEMP_UAT thay quyền Anh Hải' : user.displayName,
    roleCode: uatHaiProxy ? 'PRODUCT_AUTHORITY_UAT' : user.roleCode,
    permissions: {
      createRequest: Boolean(user.createRequest),
      assignFamily: uatHaiProxy || Boolean(user.assignFamily),
      setPriority: uatHaiProxy || Boolean(user.setPriority),
      approveGate: uatHaiProxy || Boolean(user.approveGate),
      finalApprove: uatHaiProxy || Boolean(user.finalApprove),
      technicalOperate: Boolean(user.technicalOperate)
    },
    allowed: true,
    uatHaiProxy,
    reason: ''
  };
}

function getActorContext_() {
  return getActorContextForEmail_(Session.getActiveUser().getEmail());
}

function requireAllowedActor_() {
  const actor = getActorContext_();
  if (!actor.allowed) throw new Error(actor.reason || 'Không có quyền truy cập.');
  return actor;
}

function requirePermission_(permission) {
  const actor = requireAllowedActor_();
  if (!actor.permissions[permission]) throw new Error('Không có quyền ' + permission + '. Actor=' + actor.email);
  return actor;
}

function requireHai_() {
  const actor = requireAllowedActor_();
  if (actor.email !== RD_CONFIG.FINAL_APPROVER && !actor.uatHaiProxy) {
    throw new Error('Thao tác này chỉ Anh Hải được thực hiện; TEMP_UAT chỉ cho phép proxy đã cấu hình.');
  }
  return actor;
}

function requireTechnicalOperator_() {
  const actor = requireAllowedActor_();
  if (!actor.permissions.technicalOperate || !RD_CONFIG.TECHNICAL_OPERATORS.includes(actor.email)) {
    throw new Error('Tài khoản không có quyền vận hành kỹ thuật R&D.');
  }
  return actor;
}

function getSystemActor_() {
  const props = PropertiesService.getScriptProperties();
  const installedBy = String(props.getProperty('RD_FLOW_SCHEDULE_INSTALLED_BY') || '')
    .split('|')[0].trim().toLowerCase();
  const user = RD_CONFIG.ALLOWED_USERS[installedBy];
  if (!installedBy || !user || !user.technicalOperate) {
    throw new Error('Không xác định được technical operator của flow schedule.');
  }
  return {
    email: installedBy,
    displayName: user.displayName,
    roleCode: 'SYSTEM_ORCHESTRATOR',
    permissions: { createRequest: false, assignFamily: false, setPriority: false, approveGate: false, finalApprove: false, technicalOperate: true },
    allowed: true,
    system: true
  };
}

function restrictedBootstrap_(actor) {
  return {
    project: { code: RD_CONFIG.PROJECT_CODE, version: RD_CONFIG.VERSION, environment: RD_CONFIG.ENVIRONMENT },
    actor,
    restricted: true,
    message: actor.reason || 'Tài khoản không có quyền truy cập.',
    kpis: {}, openDecisions: [], tasks: [], requests: [], cases: [], evidence: [], runtime: {}
  };
}
