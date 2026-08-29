import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'apps-script/ht-pd-rd-v1/Index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'apps-script/ht-pd-rd-v1/Styles.html'), 'utf8');
assert.match(index, /name="viewport"[^>]+width=device-width/);
assert.match(index, /id="languageToggle"/);
assert.match(styles, /overflow-x\s*:\s*hidden/);
assert.match(styles, /@media\(max-width:390px\)/);
assert.match(styles, /@media\(max-width:360px\)/);
console.log('mobile-ux-contract: PASS (360/390)');
