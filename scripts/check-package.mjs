import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sdk = join(root, 'packages/sdk');
const manifest = JSON.parse(readFileSync(join(sdk, 'package.json'), 'utf8'));
const temp = mkdtempSync(join(tmpdir(), 'paymentic-sdk-release-'));
const tarball = join(temp, 'sdk.tgz');
const app = join(temp, 'clean-app');

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, npm_config_update_notifier: 'false', npm_config_cache: join(temp, 'npm-cache') },
  });
}

try {
  run('pnpm', ['pack', '--out', tarball], sdk);
  const contents = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(contents.includes('package/dist/index.js'), 'ESM entry is missing from the tarball');
  assert.ok(contents.includes('package/dist/index.d.ts'), 'TypeScript declarations are missing from the tarball');
  assert.ok(contents.includes('package/LICENSE'), 'MIT license is missing from the tarball');
  assert.ok(contents.includes('package/NOTICE.md'), 'PHP reference attribution is missing from the tarball');
  const packageFiles = new Set(['package/package.json', 'package/README.md', 'package/LICENSE', 'package/NOTICE.md']);
  assert.ok(
    contents.every((path) => packageFiles.has(path) || /^package\/dist\/(?:[\w-]+\/)*[\w-]+\.(?:js|d\.ts)$/.test(path)),
    'Tarball contains unexpected files (only runtime JS, declarations and package documentation are allowed)',
  );

  // A directory outside the workspace cannot resolve its source package by accident.
  mkdirSync(app);
  writeFileSync(join(app, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(
    'npm',
    ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball],
    app,
  );
  const installed = join(app, 'node_modules', ...manifest.name.split('/'));
  const installedManifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(installedManifest.name, manifest.name);
  assert.equal(installedManifest.type, 'module');
  assert.equal(installedManifest.license, 'MIT');
  assert.deepEqual(installedManifest.dependencies ?? {}, {}, 'SDK must remain free of runtime dependencies');
  assert.equal(installedManifest.exports['.'].import, './dist/index.js');
  assert.equal(installedManifest.exports['.'].types, './dist/index.d.ts');
  assert.ok(readdirSync(join(installed, 'dist')).includes('index.d.ts'));

  writeFileSync(
    join(app, 'check.mjs'),
    `import assert from 'node:assert/strict';\nimport { PaymenticClient, verifyWebhook } from '${manifest.name}';\nassert.equal(typeof PaymenticClient, 'function');\nassert.equal(typeof verifyWebhook, 'function');\n`,
  );
  run(process.execPath, ['check.mjs'], app);

  writeFileSync(
    join(app, 'check.ts'),
    `import { PaymenticClient, verifyWebhook, type CreateTransactionRequest } from '${manifest.name}';
const request: CreateTransactionRequest = { amount: '10.00', title: 'Test' };
const client = new PaymenticClient({ apiKey: 'local', environment: 'sandbox' });
void client.createTransaction('point', request);
// @ts-expect-error Monetary values must remain decimal strings.
void client.createRefund('point', 'transaction', { amount: 1 });
// @ts-expect-error The environment must be explicitly selected.
new PaymenticClient({ apiKey: 'local' });
async function details() {
  const transaction = await client.getTransaction('point', 'transaction');
  const captured: boolean | undefined = transaction.isCaptured;
  return captured;
}
function notification(event: Awaited<ReturnType<typeof verifyWebhook>>) {
  if (event.event === 'PAYMENT.REFUND_STATUS_CHANGED') {
    const refundId: string = event.payload.refundId;
    return refundId;
  }
}
void details;
void notification;
`,
  );
  run(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2024',
      'check.ts',
    ],
    app,
  );
  console.log(`Clean Node.js package smoke passed for ${manifest.name}@${manifest.version}.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
