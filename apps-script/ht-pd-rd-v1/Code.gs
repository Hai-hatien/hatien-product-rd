function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Hà Tiên R&D')
      .addItem('Mở Dashboard R&D', 'showWebAppLink')
      .addItem('Kiểm tra runtime', 'showRuntimeCheckFromMenu')
      .addSeparator()
      .addItem('Cài lịch R0-R8 UAT', 'installRdTriggersFromMenu')
      .addToUi();
  } catch (error) {
    console.log('Không có Spreadsheet UI ở phiên chạy này: ' + error.message);
  }
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Hà Tiên — Product R&D Command Center')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function showWebAppLink() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    notifyUser_('Hà Tiên R&D', 'Chưa có Web App deployment hoạt động.');
    return null;
  }
  const html = HtmlService.createHtmlOutput(
    '<!doctype html><html><body><script>window.open(' + JSON.stringify(url) + ',"_blank");google.script.host.close();</script></body></html>'
  ).setWidth(1).setHeight(1);
  try { SpreadsheetApp.getUi().showModelessDialog(html, ''); } catch (error) {}
  return url;
}

function showRuntimeCheckFromMenu() {
  const result = verifyRuntimePrerequisites();
  notifyUser_('Kiểm tra runtime', JSON.stringify(result, null, 2));
  return result;
}

function notifyUser_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, String(message || ''), SpreadsheetApp.getUi().ButtonSet.OK);
    return 'UI_ALERT';
  } catch (error) {
    console.log('[' + title + '] ' + message);
    return 'EXECUTION_LOG';
  }
}
