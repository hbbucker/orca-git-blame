import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { launcherScript } from '../lib/linux.mjs';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "ogb-launch it's-"));
  const appimage = join(dir, 'Orca $(x).AppImage');
  writeFileSync(appimage, '#!/usr/bin/env bash\necho "ORIGINAL $*"\n');
  chmodSync(appimage, 0o755);
  const launcher = join(dir, 'orca-blame');
  return { dir, appimage, launcher };
}

test('launcher abre o Orca original quando o Node gravado não existe mais', () => {
  const { dir, appimage, launcher } = setup();
  writeFileSync(launcher, launcherScript({ state: join(dir, 'state'), appimage, nodePath: join(dir, 'nvm-removido/node'), installScript: '/nao/existe.mjs' }));
  chmodSync(launcher, 0o755);
  assert.equal(execFileSync(launcher, ['--flag', 'a b'], { env: { PATH: '/usr/bin:/bin' } }).toString().trim(), 'ORIGINAL --flag a b');
});

test('launcher abre o build patcheado quando o stamp bate', () => {
  const { dir, appimage, launcher } = setup();
  const state = join(dir, 'state');
  execFileSync('mkdir', ['-p', join(state, 'current')]);
  writeFileSync(join(state, 'current/AppRun'), '#!/usr/bin/env bash\necho "PATCHED $APPIMAGE $*"\n');
  chmodSync(join(state, 'current/AppRun'), 0o755);
  writeFileSync(join(state, 'stamp'), execFileSync('stat', ['-c', '%s-%Y', appimage]).toString().trim());
  writeFileSync(launcher, launcherScript({ state, appimage, nodePath: '/x/node', installScript: '/x/i.mjs' }));
  chmodSync(launcher, 0o755);
  assert.equal(execFileSync(launcher, ['x'], { env: { PATH: '/usr/bin:/bin' } }).toString().trim(), `PATCHED ${appimage} x`);
});
