# Hà Tiên Product R&D Command Center

Canonical repository for **HT-PD-RD-V1**.

## Scope

This repository contains only the Product R&D system. It must not contain HTG/HTC/STG website code, CRM rebuild code, WordPress runtime, or unrelated digital-platform modules.

## Locked architecture

`Mobile Dashboard -> Apps Script Web App -> Google Sheet R&D Master -> Google Drive evidence`

- Google Sheet Master ID: `1PzJe_DHC6PosnFxsMw1B_2m6MUgS_3VsgUc993VKDas`
- Product Master: read-only reference only
- WordPress/CRM write: disabled
- R&D must not create Product ID, Product Family Code, Product Type Code, Canonical Model, Market Variant, Sellable SKU, Serial, or Asset

## Agent model policy

Role routing is defined in `apps-script/ht-pd-rd-v1/AgentModelPolicy.gs`.

| Agent group | OpenAI model | reasoning.effort |
| --- | --- | --- |
| BA, PO, PM, CMO | `gpt-5.6-sol` | `xhigh` |
| DEV, Content Creator, Designer | `gpt-5.5` | `medium` |
| Other agents in team MKT | `gpt-5.5` | `xhigh` |

Resolution is fail-closed and uses explicit role mapping before the generic team fallback. The OpenAI execution adapter uses the Responses API and reads the API key only from Script Property `RD_AGENT_OPENAI_API_KEY`; the key must never be committed or written to Sheet/audit logs.

## Delivery order

1. Backend/workflow correctness
2. Behavioral tests and BACKEND_READY evidence
3. Mobile UX
4. UAT deployment/runtime proof
5. Production only after no P0 blockers

## Workflow

`Request -> M0 -> R1 + R2 + R3 -> M4 -> R4 -> R5 + R6 -> R7 -> R8 -> Handover`

R1/R2/R3 fan out after M0 and must not be serialized by accidental dependencies.

## Apps Script deployment — fail closed

The UAT deployment workflow is `.github/workflows/apps-script-deploy.yml` and uses `@google/clasp`.

Configure these **GitHub Environment secrets** in environment `uat`:

- `APPS_SCRIPT_ID` — required. Script ID of the existing HT-PD-RD Apps Script project.
- `CLASPRC_JSON` — required. OAuth credential JSON created by `clasp login` for the authorized `gpt@hatiencorp.vn` account. Never commit or print this value.
- `APPS_SCRIPT_DEPLOYMENT_ID` — optional deployment coordinate for the existing UAT Web App. When absent, source may be pushed to the Apps Script project, but the workflow stops fail-closed and will not create a new Web App deployment automatically.

Workflow contract:

`checkout -> install clasp -> validate secrets -> create .clasp.json -> write ~/.clasprc.json -> validate source -> clasp push --force -> require existing deployment id -> create immutable version -> update existing deployment`

No Apps Script/OAuth secret belongs in repository files or logs. GitHub source alone is not deployment evidence. Deployment is considered proven only after the workflow successfully pushes/updates the existing Apps Script deployment and runtime verification succeeds.

## Environment

Current target: **UAT**. Static source or a GitHub commit is not deployment evidence.

## Giao diện Product R&D song ngữ

Source giao diện độc lập nằm trong `apps-script/ht-pd-rd-v1/`, không dùng repo Market/PR-MKT. Tiếng Việt là chế độ mặc định; tiếng Anh là chế độ phụ qua nút đổi ngôn ngữ. Bước đầu chỉ đọc và tóm tắt dữ liệu từ R&D Master, không ghi Sheet, không tạo sản phẩm, không ghi CRM và không đăng WordPress.

Mã cột và mã trạng thái kỹ thuật được giữ nguyên trong phần xử lý nền; chỉ nhãn hiển thị được dịch qua từ điển trong `Client.html`.
