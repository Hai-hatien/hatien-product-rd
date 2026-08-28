# Runtime Execution API investigation

Status: investigating current Apps Script Execution API blocker after OAuth refresh.

Known facts:
- Canonical Apps Script ID: `1TGVEpC82jSws4y6lzl2vHSZ8Z8H0dkHhUFLY5_oPaSdCbY7e4knbqsfL`
- Existing Web App deployment ID: `AKfycbyfMvQKqkRD7NMHIE2S9Hy-8YdA02pwNLR70L62N11L3b4rdHM7yxBLzfWkTCtoO4Sy`
- `clasp push` and deployment update already succeeded.
- Refreshed `CLASPRC_JSON` removed the prior `invalid_grant / invalid_rapt` failure.
- Current blocker from `clasp run verifyRuntimePrerequisites --nondev`: `Unable to run script function. Please make sure you have permission to run the script function.`

This note is evidence only; it does not mark runtime UAT PASS.
