/**
 * Hà Tiên Product R&D Command Center
 * Canonical runtime configuration — backend/v1.3-hardening
 */
const RD_CONFIG = Object.freeze({
  PROJECT_CODE: 'HT-PD-RD-V1',
  VERSION: '1.3.1',
  ENVIRONMENT: 'UAT',
  SPREADSHEET_ID: '1PzJe_DHC6PosnFxsMw1B_2m6MUgS_3VsgUc993VKDas',
  PROJECT_FOLDER_ID: '10YpAvJSbvq-AMRWeHE0pgDds9Yp0C-ty',
  EVIDENCE_FOLDER_ID: '1AEmuUcGGywZ2B9cMjJDmGcO64MSI8bil',
  TIME_ZONE: 'Asia/Ho_Chi_Minh',

  FINAL_APPROVER: 'ht@hatiencorp.vn',
  TECHNICAL_OPERATORS: Object.freeze(['gpt@hatiencorp.vn']),
  TEMP_UAT_HAI_PROXY_EMAILS: Object.freeze(['gpt@hatiencorp.vn']),
  PRIORITY_PRODUCT_SCOPE: 'Fryer công nghiệp',
  PRODUCT_MASTER_MODE: 'READ_ONLY',
  WORDPRESS_CONNECTION: 'DISABLED',

  PRODUCT_MASTER_REFERENCE: Object.freeze({
    sourceRecordType: 'FAMILY_CONTAINER',
    sourceFamilyContainerId: 910502,
    sourceFamilyKey: 'SP-BEP-CHIEN-QUAY-RAO-DAU',
    sourceFamilyName: 'Bếp chiên / quầy ráo dầu',
    categoryCode: 'CKG',
    familyTokenCandidate: 'FRY',
    familyDisplayCandidate: 'HT-FRY',
    familyReviewStatus: 'REVIEW_REQUIRED'
  }),

  GEMINI: Object.freeze({
    API_KEY_PROPERTY: 'GEMINI_API_KEY',
    MODEL_PROPERTY: 'GEMINI_MODEL',
    DEFAULT_MODEL: 'gemini-3.5-flash-lite',
    ENDPOINT_ROOT: 'https://generativelanguage.googleapis.com/v1beta/models/',
    MAX_OUTPUT_TOKENS: 6000,
    MAX_TASKS_PER_RUN: 3,
    RESEARCH_FLOWS: Object.freeze(['R1', 'R2', 'R3'])
  }),

  ALLOWED_USERS: Object.freeze({
    'ht@hatiencorp.vn': Object.freeze({
      displayName: 'Anh Hải',
      roleCode: 'PRODUCT_AUTHORITY',
      createRequest: true,
      assignFamily: true,
      setPriority: true,
      approveGate: true,
      finalApprove: true,
      technicalOperate: false
    }),
    'gpt@hatiencorp.vn': Object.freeze({
      displayName: 'CMO / R&D Coordinator',
      roleCode: 'CMO_GATE_APPROVER',
      createRequest: true,
      assignFamily: false,
      setPriority: false,
      approveGate: true,
      finalApprove: false,
      technicalOperate: true
    }),
    'youtube1@hatiencorp.vn': Object.freeze({
      displayName: 'MKT',
      roleCode: 'REQUEST_CREATOR',
      createRequest: true,
      assignFamily: false,
      setPriority: false,
      approveGate: false,
      finalApprove: false,
      technicalOperate: false
    })
  }),

  SHEETS: Object.freeze({
    DASHBOARD: '00_Dashboard_Data',
    REQUESTS: '01_RD_Requests',
    PRODUCT_MASTER_REFERENCE: '02_Product_Master_Reference',
    PORTFOLIO: '03_RD_Portfolio',
    MARKET_RESEARCH: '04_Market_Research',
    VOC: '05_VOC_UseCases',
    BENCHMARK: '06_Competitor_Benchmark',
    REQUIREMENTS: '07_Requirements',
    CONCEPTS: '08_Concepts_Revisions',
    PROTOTYPES: '09_Prototype_Builds',
    TEST_PLANS: '10_Test_Plans',
    TEST_RESULTS: '11_Test_Results',
    FMEA: '12_Risks_FMEA',
    BOM_DFM: '13_BOM_DFM_Cost',
    CLAIMS: '14_Claims_Proof',
    DECISIONS: '15_Decisions_Approvals',
    TASKS: '16_Tasks_Blockers',
    EVIDENCE: '17_Files_Evidence',
    PILOT: '18_Pilot_Feedback',
    HANDOVER: '19_Handover_Export',
    FLOW_REPORTS: '20_Flow_Reports',
    FLOW_RUN_LOG: '94_Flow_Run_Log',
    FLOW_SCHEDULE: '95_Flow_Schedule',
    RUNTIME_CONFIG: '96_Runtime_Config',
    FLOW_REGISTRY: '97_Flow_Registry',
    AUDIT: '98_Audit_Log',
    CONFIG: '99_Config_Access'
  }),

  REQUIRED_HEADERS: Object.freeze({
    '01_RD_Requests': Object.freeze([
      'RD_REQUEST_ID', 'REQUEST_TITLE', 'REQUESTED_AT', 'REQUESTED_BY',
      'REQUESTER_ROLE', 'RD_SCOPE_TYPE', 'TARGET_PRODUCT', 'SOURCE_RECORD_TYPE',
      'SOURCE_FAMILY_CONTAINER_ID', 'SOURCE_FAMILY_KEY', 'REQUEST_STATUS',
      'FAMILY_ASSIGNMENT_STATUS', 'WORK_PRIORITY', 'PRIORITY_STATUS',
      'TARGET_MARKET', 'TARGET_CUSTOMER', 'CUSTOMER_PAIN', 'TARGET_OUTCOMES',
      'CONSTRAINTS', 'SOURCE_TYPE', 'SOURCE_URL_OR_FILE', 'FINAL_APPROVER',
      'DEDUP_STATUS', 'NOTES'
    ]),
    '03_RD_Portfolio': Object.freeze([
      'RD_CASE_ID', 'RD_REQUEST_ID', 'CASE_TITLE', 'CREATED_AT', 'CASE_OWNER',
      'PRODUCT_SCOPE', 'SOURCE_FAMILY_CONTAINER_ID', 'CURRENT_STAGE', 'CASE_STATUS',
      'M4_DECISION', 'CONCEPT_GATE', 'TECHNICAL_GATE', 'DFM_GATE', 'QA_GATE',
      'PILOT_GATE', 'FINAL_HANDOVER', 'WORK_PRIORITY', 'PRIORITY_STATUS',
      'NEXT_ACTION', 'NEXT_ACTION_OWNER', 'DUE_DATE', 'BLOCKER_COUNT',
      'EVIDENCE_COVERAGE', 'NOTES'
    ]),
    '04_Market_Research': Object.freeze([
      'MARKET_EVIDENCE_ID', 'RD_CASE_ID', 'GATE', 'RESEARCH_TOPIC', 'MARKET',
      'SEGMENT', 'SIGNAL_TYPE', 'SOURCE_TITLE', 'SOURCE_ORGANIZATION',
      'SOURCE_URL_OR_FILE', 'PUBLISHED_DATE', 'ACCESSED_AT', 'EXTRACT',
      'EVIDENCE_LABEL', 'CONFIDENCE', 'ENTERED_BY', 'STATUS', 'NEXT_ACTION'
    ]),
    '05_VOC_UseCases': Object.freeze([
      'VOC_ID', 'RD_CASE_ID', 'SOURCE_DATE', 'SOURCE_CHANNEL', 'CUSTOMER_GROUP',
      'VOC_VERBATIM', 'NORMALIZED_NEED', 'OPERATING_CONTEXT', 'FREQUENCY',
      'PAIN_SEVERITY', 'EVIDENCE_LABEL', 'SOURCE_REF', 'OWNER', 'STATUS', 'NOTES'
    ]),
    '06_Competitor_Benchmark': Object.freeze([
      'COMPETITOR_EVIDENCE_ID', 'RD_CASE_ID', 'MARKET', 'BRAND', 'MODEL',
      'PRODUCT_TYPE', 'ENERGY_SOURCE', 'CAPACITY_L', 'POWER_KW',
      'TEMPERATURE_RANGE_C', 'RECOVERY_INDICATOR', 'SAFETY_FEATURES', 'MATERIAL',
      'SERVICE', 'PRICE_CURRENCY', 'PRICE_VALUE', 'SOURCE_URL', 'ACCESSED_AT',
      'EVIDENCE_LABEL', 'CONFIDENCE', 'REVIEW_STATUS', 'NOTES'
    ]),
    '08_Concepts_Revisions': Object.freeze([
      'CONCEPT_ID', 'RD_CASE_ID', 'REVISION_ID', 'CONCEPT_NAME', 'CONCEPT_SUMMARY',
      'ASSUMPTIONS', 'CALCULATIONS_REF', 'SAFETY_BY_DESIGN', 'PRELIM_BOM_REF',
      'FMEA_REF', 'CREATED_BY', 'CREATED_AT', 'REVIEW_STATUS', 'GATE_DECISION',
      'APPROVER', 'APPROVED_AT', 'CHANGE_REASON'
    ]),
    '11_Test_Results': Object.freeze([
      'TEST_RUN_ID', 'TEST_PLAN_ID', 'RD_CASE_ID', 'REVISION_ID', 'RUN_AT',
      'RUN_BY', 'RAW_DATA_REF', 'MEASURED_RESULT', 'UNIT', 'OBSERVATIONS',
      'DEVIATIONS', 'EVIDENCE_IDS', 'RESULT_ASSESSMENT', 'REVIEWED_BY',
      'REVIEWED_AT', 'NOTES'
    ]),
    '15_Decisions_Approvals': Object.freeze([
      'DECISION_ID', 'RD_CASE_ID', 'DECISION_TYPE', 'DECISION_SCOPE',
      'DECISION_VALUE', 'DECIDED_BY', 'DECIDED_AT', 'STATUS',
      'SEGREGATION_REQUIRED', 'EVIDENCE_REF', 'PREVIOUS_DECISION_ID', 'NOTES'
    ]),
    '16_Tasks_Blockers': Object.freeze([
      'TASK_ID', 'RD_CASE_ID', 'FLOW_ID', 'SUBFLOW_ID', 'TASK_TITLE', 'TASK_TYPE',
      'OWNER', 'DUE_DATE', 'PRIORITY', 'STATUS', 'DEPENDS_ON', 'BLOCKER_REASON',
      'OUTPUT_SHEET', 'GATE_REQUIRED', 'CREATED_AT', 'UPDATED_AT', 'NOTES'
    ]),
    '17_Files_Evidence': Object.freeze([
      'EVIDENCE_ID', 'RD_CASE_ID', 'REVISION_ID', 'TEST_RUN_ID', 'EVIDENCE_TYPE',
      'DRIVE_FILE_ID', 'DRIVE_URL', 'FILE_NAME', 'SOURCE_ORG', 'PUBLISHED_DATE',
      'ACCESSED_AT', 'EVIDENCE_LABEL', 'CONFIDENCE', 'ENTERED_BY',
      'LINKED_RECORD', 'NOTES'
    ]),
    '19_Handover_Export': Object.freeze([
      'HANDOVER_ID', 'RD_CASE_ID', 'APPROVED_REVISION_ID', 'PRODUCT_ID',
      'PRODUCT_FAMILY_CODE', 'PRODUCT_TYPE_CODE', 'CANONICAL_MODEL',
      'MARKET_VARIANT', 'SELLABLE_SKU', 'VERIFIED_SPECIFICATIONS',
      'TEST_EVIDENCE_IDS', 'R7_APPROVED_CLAIMS', 'BOM_DFM_STATUS',
      'PILOT_STATUS', 'FINAL_APPROVER', 'APPROVED_AT', 'EXPORT_STATUS', 'NOTES'
    ]),
    '97_Flow_Registry': Object.freeze([
      'FLOW_ID', 'FLOW_NAME', 'SUBFLOW_ID', 'SUBFLOW_NAME', 'PURPOSE',
      'ENTRY_CONDITION', 'EXIT_CONDITION', 'NEXT_FLOWS', 'SHEETS'
    ]),
    '98_Audit_Log': Object.freeze([
      'AUDIT_ID', 'EVENT_AT', 'ACTOR_EMAIL', 'ACTOR_ROLE', 'ACTION',
      'ENTITY_TYPE', 'ENTITY_ID', 'BEFORE_STATE', 'AFTER_STATE',
      'EVIDENCE_REF', 'RESULT', 'NOTES'
    ])
  })
});

const RD_ENUM = Object.freeze({
  REQUEST_STATUS: Object.freeze(['REQUESTED', 'RESEARCH_APPROVED', 'NEED_MORE_INFO', 'HOLD', 'REJECTED']),
  SCOPE_TYPE: Object.freeze(['PRODUCT_MODEL', 'FAMILY_REFERENCE', 'CUSTOM_VARIANT', 'NEW_PRODUCT']),
  PRIORITY: Object.freeze(['P0', 'P1', 'P2', 'P3']),
  EVIDENCE_LABEL: Object.freeze(['ĐÃ XÁC MINH', 'HẢI CUNG CẤP - CHỜ KIỂM CHỨNG', 'BẢN NHÁP/LỊCH SỬ', 'CHƯA BIẾT']),
  TASK_STATUS: Object.freeze([
    'NOT_STARTED', 'READY', 'READY_MONITORING', 'IN_PROGRESS', 'WAITING_INPUT',
    'WAITING_DEPENDENCY', 'WAITING_AUTHORIZED_APPROVAL', 'BLOCKED', 'HANDOFF_READY',
    'HOLD', 'STOPPED', 'CLOSED_WITH_EVIDENCE', 'COMPLETED_LIMITED_SCOPE', 'CLOSED_WITH_REVIEW_REQUIRED'
  ]),
  GATE_STATUS: Object.freeze([
    'GATE_NOT_READY', 'GATE_READY_FOR_REVIEW', 'GATE_NEED_MORE_EVIDENCE',
    'GATE_HOLD_RECOMMENDED', 'GATE_STOP_RECOMMENDED', 'GATE_APPROVED', 'GATE_REJECTED'
  ]),
  DECISION_ACTION: Object.freeze(['CONTINUE', 'SUPPLEMENT', 'HOLD', 'STOP']),
  M4: Object.freeze(['GO_CONCEPT', 'RESEARCH_MORE', 'HOLD', 'STOP'])
});

const RD_ID_TARGETS = Object.freeze({
  RDREQ: Object.freeze({ sheet: '01_RD_Requests', column: 'RD_REQUEST_ID' }),
  RDCASE: Object.freeze({ sheet: '03_RD_Portfolio', column: 'RD_CASE_ID' }),
  MR: Object.freeze({ sheet: '04_Market_Research', column: 'MARKET_EVIDENCE_ID' }),
  VOC: Object.freeze({ sheet: '05_VOC_UseCases', column: 'VOC_ID' }),
  CMP: Object.freeze({ sheet: '06_Competitor_Benchmark', column: 'COMPETITOR_EVIDENCE_ID' }),
  CON: Object.freeze({ sheet: '08_Concepts_Revisions', column: 'CONCEPT_ID' }),
  RDREV: Object.freeze({ sheet: '08_Concepts_Revisions', column: 'REVISION_ID' }),
  TR: Object.freeze({ sheet: '11_Test_Results', column: 'TEST_RUN_ID' }),
  DEC: Object.freeze({ sheet: '15_Decisions_Approvals', column: 'DECISION_ID' }),
  RDT: Object.freeze({ sheet: '16_Tasks_Blockers', column: 'TASK_ID' }),
  EVD: Object.freeze({ sheet: '17_Files_Evidence', column: 'EVIDENCE_ID' }),
  HND: Object.freeze({ sheet: '19_Handover_Export', column: 'HANDOVER_ID' }),
  AUD: Object.freeze({ sheet: '98_Audit_Log', column: 'AUDIT_ID' })
});
