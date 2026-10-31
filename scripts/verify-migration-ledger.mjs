import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const manifestPath = path.join(root, 'supabase', 'migration-ledger.manifest.json');

function gitBlobSha1(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const expectedFiles = new Set(manifest.migrations.map(item => path.basename(item.file)));
const actualFiles = (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort();
const failures = [];
const versions = manifest.migrations.map(item => String(item.version));
const uniqueVersions = new Set(versions);
if (uniqueVersions.size !== versions.length) failures.push('Duplicate migration version found in manifest');
if (versions.some((version, index) => index > 0 && versions[index - 1] >= version)) {
  failures.push('Manifest migration versions must be strictly increasing');
}
for (const migration of manifest.migrations) {
  const filename = path.basename(migration.file);
  if (!filename.startsWith(String(migration.version) + '_')) {
    failures.push(migration.file + ': filename timestamp does not match manifest version ' + migration.version);
  }
}
for (const pending of manifest.pendingLocalMigrations || []) {
  if (!versions.includes(String(pending))) failures.push('Pending migration version is missing from manifest: ' + pending);
}
if (Number(manifest.recordedMigrationCount) + (manifest.pendingLocalMigrations || []).length !== manifest.migrations.length) {
  failures.push('Manifest recorded/pending migration counts do not match the active migration inventory');
}


for (const migration of manifest.migrations) {
  try {
    const content = await readFile(path.join(root, migration.file), 'utf8');
    if (gitBlobSha1(content) !== migration.gitBlobSha1) failures.push(migration.file + ': content hash mismatch');
  } catch (error) {
    failures.push(migration.file + ': missing or unreadable (' + String(error?.message || error) + ')');
  }
}
for (const actual of actualFiles) {
  if (!expectedFiles.has(actual)) failures.push('Unexpected migration file in active migration directory: ' + actual);
}
if (actualFiles.length !== expectedFiles.size) {
  failures.push('Expected ' + expectedFiles.size + ' active SQL migrations, found ' + actualFiles.length);
}
if (failures.length) {
  for (const failure of failures) console.error('MIGRATION LEDGER CHECK FAILED: ' + failure);
  process.exitCode = 1;
} else {
  console.log('Supabase migration manifest integrity passed (' + manifest.migrations.length + ' local SQL files, including pending reconciliation).');
}
