// The body map and the equipment icons have one home: web/app/src/shared. Vercel uploads only the
// project being deployed, so the copies here are committed, and this script refreshes them.
// Run it after changing an original: npm run sync:shared
// It is also the prebuild step, where the source is absent (a Vercel build sees only this folder),
// so a missing source is not an error — the committed copy is what ships.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', '..', 'app', 'src', 'shared');
const to = join(here, '..', 'src', 'shared');
const files = ['equipment-icons.js', 'equipment-icons.d.ts', 'ui-icons.js', 'ui-icons.d.ts'];
const banner = '// Copied by npm run sync:shared from web/app/src/shared — edit the original, not this.\n';

try {
  await access(from);
} catch {
  console.log('shared source not here (deploy build): using the committed copies');
  process.exit(0);
}

await mkdir(to, { recursive: true });
for (const f of files) await writeFile(join(to, f), banner + await readFile(join(from, f), 'utf8'));
console.log(`synced ${files.length} shared files from web/app/src/shared`);
