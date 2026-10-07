#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

export function parseArgs(argv) {
  const args = { appimage: null, installDir: null, check: false, quiet: false, ensure: false, skipShortcut: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--appimage') args.appimage = argv[++i];
    else if (argv[i] === '--install-dir') args.installDir = argv[++i];
    else if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--quiet') args.quiet = true;
    else if (argv[i] === '--ensure') args.ensure = true;
    else if (argv[i] === '--skip-shortcut') args.skipShortcut = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

export async function platformModule(platform = process.platform) {
  if (platform === 'linux') return import('../lib/linux.mjs');
  if (platform === 'win32') return import('../lib/windows.mjs');
  throw new Error(`unsupported platform: ${platform} (supported: linux, win32)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const log = args.quiet ? () => {} : (msg) => console.log(msg);
    (await platformModule()).install(args, log);
  } catch (error) {
    console.error(`[orca-git-blame] ${error.message}`);
    process.exit(1);
  }
}
