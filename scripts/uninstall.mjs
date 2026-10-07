#!/usr/bin/env node
import { platformModule } from './install.mjs';

try {
  (await platformModule()).uninstall((msg) => console.log(msg));
} catch (error) {
  console.error(`[orca-git-blame] ${error.message}`);
  process.exit(1);
}
