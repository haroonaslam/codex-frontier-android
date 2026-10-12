import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readFrontierAccessSettingsSync, writeFrontierAccessMode } from './frontierAccess'

const originalCodexHome = process.env.CODEX_HOME
const originalSandboxMode = process.env.CODEXUI_SANDBOX_MODE
const originalApprovalPolicy = process.env.CODEXUI_APPROVAL_POLICY

afterEach(() => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = originalCodexHome
  if (originalSandboxMode === undefined) delete process.env.CODEXUI_SANDBOX_MODE
  else process.env.CODEXUI_SANDBOX_MODE = originalSandboxMode
  if (originalApprovalPolicy === undefined) delete process.env.CODEXUI_APPROVAL_POLICY
  else process.env.CODEXUI_APPROVAL_POLICY = originalApprovalPolicy
})

describe('Frontier access settings', () => {
  it('inherits the launcher policy until the user makes a choice', async () => {
    process.env.CODEX_HOME = await mkdtemp(join(tmpdir(), 'frontier-access-'))
    process.env.CODEXUI_SANDBOX_MODE = 'workspace-write'
    process.env.CODEXUI_APPROVAL_POLICY = 'on-request'

    expect(readFrontierAccessSettingsSync()).toEqual({
      mode: 'ask',
      configured: false,
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-request',
    })
  })

  it('persists automatic and full access modes with the expected runtime policy', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'frontier-access-'))
    process.env.CODEX_HOME = codexHome

    expect(await writeFrontierAccessMode('automatic')).toMatchObject({
      mode: 'automatic',
      sandboxMode: 'workspace-write',
      approvalPolicy: 'never',
    })
    expect(await writeFrontierAccessMode('full')).toMatchObject({
      mode: 'full',
      sandboxMode: 'danger-full-access',
      approvalPolicy: 'never',
    })
    expect(JSON.parse(await readFile(join(codexHome, 'frontier-access.json'), 'utf8'))).toEqual({
      version: 1,
      mode: 'full',
    })
  })

  it('rejects unsupported access modes', async () => {
    process.env.CODEX_HOME = await mkdtemp(join(tmpdir(), 'frontier-access-'))
    await expect(writeFrontierAccessMode('unsafe-ish')).rejects.toThrow('Choose Ask approval')
  })
})
