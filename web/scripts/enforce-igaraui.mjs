import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const VALID_EXTENSIONS = new Set(['.tsx', '.jsx']);
const INLINE_STYLE_PATTERN = /style=\{\{/;
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

const INLINE_STYLE_ALLOWLIST = new Set([
  'modules/dashboard/Dashboard.tsx',
  'modules/leads/LeadDetail.tsx',
  'modules/settings/Settings.tsx',
  'shared/layout/AppLayout.tsx',
  'shared/ui/Logo.tsx',
]);

const HEX_ALLOWLIST = new Set(['modules/leads/LeadDetail.tsx']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return VALID_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
    })
  );
  return files.flat();
}

async function main() {
  const files = await walk(ROOT);
  const errors = [];

  for (const filePath of files) {
    const relativePath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = await readFile(filePath, 'utf8');

    if (!INLINE_STYLE_ALLOWLIST.has(relativePath) && INLINE_STYLE_PATTERN.test(content)) {
      errors.push(`${relativePath}: inline style is not allowed (style={{...}})`);
    }

    const hexMatches = content.match(HEX_PATTERN);
    if (!HEX_ALLOWLIST.has(relativePath) && hexMatches) {
      errors.push(`${relativePath}: hardcoded hex colors are not allowed (${hexMatches[0]})`);
    }
  }

  if (errors.length > 0) {
    console.error('\nIgaraUI enforcement failed:\n');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('IgaraUI enforcement passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
