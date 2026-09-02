import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const capacitorArgs = existsSync('android')
  ? ['cap', 'sync', 'android']
  : ['cap', 'add', 'android'];

const capacitorCli = resolve('node_modules/@capacitor/cli/bin/capacitor');
const result = spawnSync(process.execPath, [capacitorCli, ...capacitorArgs.slice(1)], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
