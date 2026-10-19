import { existsSync } from 'node:fs'
import { basename } from 'node:path'

const isWin = process.platform === 'win32'

/** Platform default: PowerShell on Windows, the user's login shell elsewhere. */
export function defaultShell(): string {
  if (isWin) return 'powershell.exe'
  const env = process.env.SHELL
  if (env && existsSync(env)) return env
  for (const s of process.platform === 'darwin' ? ['/bin/zsh', '/bin/bash'] : ['/bin/bash', '/usr/bin/bash', '/bin/sh'])
    if (existsSync(s)) return s
  return '/bin/sh'
}

/**
 * Resolves the shell stored on a desk. Empty means "platform default"; a Windows-only
 * shell carried over from another OS (synced config) also falls back to the default.
 */
export function resolveShell(stored: string | undefined): { file: string; args: string[] } {
  let file = stored?.trim() || defaultShell()
  if (!isWin && /\.exe$/i.test(file)) file = defaultShell()
  const name = basename(file).toLowerCase()
  if (/^(powershell|pwsh)(\.exe)?$/.test(name)) return { file, args: ['-NoLogo'] }
  if (isWin) return { file, args: [] }
  // Login shell so PATH etc. match a normal terminal (matters on macOS when launched from Finder).
  if (/^(bash|zsh|fish|sh|ksh)$/.test(name)) return { file, args: ['-l'] }
  return { file, args: [] }
}

export function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'terminal-office'
  // GUI-launched apps on macOS/Linux often have no locale → broken UTF-8 in the shell.
  if (!isWin && !env.LANG && !env.LC_ALL) env.LANG = 'en_US.UTF-8'
  return env
}
