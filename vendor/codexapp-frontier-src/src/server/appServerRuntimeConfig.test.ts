import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAppServerArgs } from './appServerRuntimeConfig'

describe('app-server runtime config', () => {
  it('enables Codex memories by default for spawned app-server processes', () => {
    const args = buildAppServerArgs()
    const featureIndex = args.indexOf('features.memories=true')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
  })

  it('can disable Codex memories through runtime configuration', () => {
    process.env.CODEXUI_MEMORIES = 'false'
    try {
      const args = buildAppServerArgs()
      const featureIndex = args.indexOf('features.memories=false')

      expect(featureIndex).toBeGreaterThan(0)
      expect(args[featureIndex - 1]).toBe('-c')
      expect(args).not.toContain('features.memories=true')
    } finally {
      delete process.env.CODEXUI_MEMORIES
    }
  })

  it('adds configured Frontier writable roots to the app-server sandbox', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'frontier-runtime-config-'))
    const project = join(codexHome, 'external-project')
    await mkdir(project)
    await writeFile(join(codexHome, 'frontier-writable-roots.json'), JSON.stringify({ version: 1, roots: [project] }))
    process.env.CODEX_HOME = codexHome
    try {
      expect(buildAppServerArgs()).toContain(`sandbox_workspace_write.writable_roots=${JSON.stringify([project])}`)
    } finally {
      delete process.env.CODEX_HOME
    }
  })

  it('uses the persisted Frontier access mode instead of launcher defaults', async () => {
    const codexHome = await mkdtemp(join(tmpdir(), 'frontier-runtime-access-'))
    await writeFile(join(codexHome, 'frontier-access.json'), JSON.stringify({ version: 1, mode: 'full' }))
    process.env.CODEX_HOME = codexHome
    process.env.CODEXUI_SANDBOX_MODE = 'workspace-write'
    process.env.CODEXUI_APPROVAL_POLICY = 'on-request'
    try {
      const args = buildAppServerArgs()
      expect(args).toContain('sandbox_mode="danger-full-access"')
      expect(args).toContain('approval_policy="never"')
    } finally {
      delete process.env.CODEX_HOME
      delete process.env.CODEXUI_SANDBOX_MODE
      delete process.env.CODEXUI_APPROVAL_POLICY
    }
  })
})
