/**
 * Command + arguments that run pnpm on every platform. On Windows `pnpm` is a `.cmd` shim, which
 * Node refuses to spawn without a shell, so reuse the pnpm entry point running the current script
 * (`npm_execpath`) through this Node binary, and fall back to `pnpm` on PATH elsewhere.
 */
export function pnpm(args: string[]): [command: string, args: string[]] {
  const entry = process.env.npm_execpath;
  return entry && /\.[cm]?js$/.test(entry) ? [process.execPath, [entry, ...args]] : ['pnpm', args];
}
