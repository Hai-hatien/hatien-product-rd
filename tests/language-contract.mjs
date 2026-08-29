import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(root, 'apps-script/ht-pd-rd-v1/Index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'apps-script/ht-pd-rd-v1/Client.html'), 'utf8');
const forbidden = /\b(dashboard|backend|frontend|publish|lifecycle|uat|checklist|status|task|blocker|pass|fail|golive|review|approval|workflow|queue|evidence|claim|gate)\b/i;
const visibleText = index.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&');
assert.match(client, /const LANGUAGE_DICTIONARY/);
assert.match(client, /let languageMode = 'vi'/);
assert.match(index, /id="languageToggle"/);
assert.doesNotMatch(visibleText, forbidden, 'Vietnamese static UI contains a forbidden technical term');
assert.match(client, /function toggleLanguage/);
assert.match(client, /google\.script\.run/);
console.log('language-contract: PASS');
