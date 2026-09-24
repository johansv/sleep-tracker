import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const bins = {
  wrangler: resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js'),
  playwright: require.resolve('@playwright/test/cli'),
};
export function run(bin: string, args: string[], env = process.env, quiet = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env,
      windowsHide: true,
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Command failed (${code}): ${bin}\n${output}`)),
    );
  });
}
