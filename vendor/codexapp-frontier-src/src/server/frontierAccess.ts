import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type FrontierAccessMode = 'ask' | 'automatic' | 'full'

export type FrontierAccessSettings = {
  mode: FrontierAccessMode
  configured: boolean
  sandboxMode: 'workspace-write' | 'danger-full-access'
  approvalPolicy: 'on-request' | 'never'
}

const ACCESS_MODES = new Set<FrontierAccessMode>(['ask', 'automatic', 'full'])
const ACCESS_SETTINGS_FILE = 'frontier-access.json'

function getCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || join(process.env.HOME?.trim() || process.cwd(), '.codex')
}

function getAccessSettingsPath(): string {
  return join(getCodexHome(), ACCESS_SETTINGS_FILE)
}

function runtimeForMode(mode: FrontierAccessMode): Omit<FrontierAccessSettings, 'mode' | 'configured'> {
  if (mode === 'full') {
    return { sandboxMode: 'danger-full-access', approvalPolicy: 'never' }
  }
  if (mode === 'automatic') {
    return { sandboxMode: 'workspace-write', approvalPolicy: 'never' }
  }
  return { sandboxMode: 'workspace-write', approvalPolicy: 'on-request' }
}

function inferModeFromEnvironment(): FrontierAccessMode {
  const sandboxMode = process.env.CODEXUI_SANDBOX_MODE?.trim().toLowerCase()
  const approvalPolicy = process.env.CODEXUI_APPROVAL_POLICY?.trim().toLowerCase()
  if (sandboxMode === 'danger-full-access' && approvalPolicy === 'never') return 'full'
  if (approvalPolicy === 'never') return 'automatic'
  return 'ask'
}

function readStoredMode(): FrontierAccessMode | null {
  const settingsPath = getAccessSettingsPath()
  if (!existsSync(settingsPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as { mode?: unknown }
    return typeof parsed.mode === 'string' && ACCESS_MODES.has(parsed.mode as FrontierAccessMode)
      ? parsed.mode as FrontierAccessMode
      : null
  } catch {
    return null
  }
}

export function readFrontierAccessSettingsSync(): FrontierAccessSettings {
  const storedMode = readStoredMode()
  const mode = storedMode ?? inferModeFromEnvironment()
  return { mode, configured: storedMode !== null, ...runtimeForMode(mode) }
}

export async function writeFrontierAccessMode(mode: string): Promise<FrontierAccessSettings> {
  const normalized = mode.trim().toLowerCase()
  if (!ACCESS_MODES.has(normalized as FrontierAccessMode)) {
    throw new Error('Choose Ask approval, Auto approve, or Full access.')
  }
  const settingsPath = getAccessSettingsPath()
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify({ version: 1, mode: normalized }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(temporaryPath, settingsPath)
  return readFrontierAccessSettingsSync()
}
