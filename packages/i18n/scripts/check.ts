import { flattenMessages } from '../src/index.ts';
import { en } from '../src/locales/en.ts';
import { si } from '../src/locales/si.ts';
import { ta } from '../src/locales/ta.ts';

const english = flattenMessages(en);
const sinhala = flattenMessages(si);
const tamil = flattenMessages(ta);

const missing: string[] = [];
for (const key of Object.keys(english)) {
  if (typeof sinhala[key] !== 'string') missing.push(`si:${key}`);
  if (typeof tamil[key] !== 'string') missing.push(`ta:${key}`);
}
for (const key of Object.keys(sinhala)) {
  if (!(key in english)) missing.push(`extra si:${key}`);
}
for (const key of Object.keys(tamil)) {
  if (!(key in english)) missing.push(`extra ta:${key}`);
}

if (missing.length > 0) {
  console.error(missing.join('\n'));
  process.exit(1);
}

console.log(`i18n check passed (${Object.keys(english).length} keys in en, si, ta)`);
