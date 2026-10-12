import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import AdmZip from 'adm-zip'
import { browseFrontierFiles, getFrontierFileRoots, importSkillsZip, writeFrontierFile } from './frontierFiles'

async function fixture(): Promise<string> {
  const fixtureHome = await mkdtemp(join(tmpdir(), 'frontier-files-'))
  const appHome = join(fixtureHome, 'codex-subscription-isolated-app')
  const codexHome = join(appHome, 'runtime', '.codex')
  await mkdir(join(codexHome, 'skills', 'demo'), { recursive: true })
  await mkdir(join(codexHome, 'memory'), { recursive: true })
  await mkdir(join(codexHome, 'memories'), { recursive: true })
  await writeFile(join(codexHome, 'skills', 'AGENTS.md'), '# Global instructions\n', 'utf8')
  await mkdir(join(fixtureHome, 'codex-workspace'), { recursive: true })
  await writeFile(join(fixtureHome, 'codex-workspace', 'AGENTS.md'), '# Instructions\n', 'utf8')
  await writeFile(join(codexHome, 'DEVELOPMENT.md'), '# Development\n', 'utf8')
  await writeFile(join(codexHome, 'config.toml'), 'model = "gpt"\n', 'utf8')
  await writeFile(join(codexHome, 'skills', 'demo', 'SKILL.md'), '# Demo\n', 'utf8')
  return codexHome
}

describe('Frontier file workspace', () => {
  it('exposes only the explicit non-secret roots', async () => {
    const codexHome = await fixture()
    expect(getFrontierFileRoots(codexHome).map((root) => root.id)).toEqual([
      'globalInstructions', 'workspaceInstructions', 'development', 'memory', 'memories', 'skills', 'config',
    ])
  })

  it('opens and edits both workspace instructions and the development reference', async () => {
    const codexHome = await fixture()
    expect(await browseFrontierFiles('globalInstructions', '', codexHome)).toMatchObject({
      kind: 'file',
      content: '# Global instructions\n',
    })
    expect(await browseFrontierFiles('workspaceInstructions', '', codexHome)).toMatchObject({
      kind: 'file',
      content: '# Instructions\n',
    })
    expect(await browseFrontierFiles('development', '', codexHome)).toMatchObject({
      kind: 'file',
      content: '# Development\n',
    })
    await writeFrontierFile('globalInstructions', '', '# Global preferences\n', codexHome)
    await writeFrontierFile('workspaceInstructions', '', '# Workspace preferences\n', codexHome)
    await writeFrontierFile('development', '', '# Maintenance notes\n', codexHome)
    expect((await browseFrontierFiles('globalInstructions', '', codexHome))).toMatchObject({
      content: '# Global preferences\n',
    })
    expect((await browseFrontierFiles('workspaceInstructions', '', codexHome))).toMatchObject({
      content: '# Workspace preferences\n',
    })
    expect((await browseFrontierFiles('development', '', codexHome))).toMatchObject({
      content: '# Maintenance notes\n',
    })
  })

  it('browses and edits skill text files', async () => {
    const codexHome = await fixture()
    const listing = await browseFrontierFiles('skills', '', codexHome)
    expect(listing.kind).toBe('directory')
    const file = await browseFrontierFiles('skills', 'demo/SKILL.md', codexHome)
    expect(file).toMatchObject({ kind: 'file', content: '# Demo\n' })
    await writeFrontierFile('skills', 'demo/SKILL.md', '# Updated\n', codexHome)
    expect(await readFile(join(codexHome, 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe('# Updated\n')
  })

  it('rejects traversal outside a directory root', async () => {
    const codexHome = await fixture()
    await expect(browseFrontierFiles('skills', '../auth.json', codexHome)).rejects.toThrow(/outside/u)
  })

  it('imports rootless and wrapped skills using the SKILL.md name', async () => {
    const codexHome = await fixture()
    const zip = new AdmZip()
    zip.addFile('SKILL.md', Buffer.from('---\nname: rootless-skill\ndescription: Test\n---\n# Rootless\n'))
    zip.addFile('scripts/run.sh', Buffer.from('#!/bin/sh\n'))
    await expect(importSkillsZip(zip.toBuffer(), codexHome)).resolves.toEqual({ installed: ['rootless-skill'] })
    expect(await readFile(join(codexHome, 'skills', 'rootless-skill', 'scripts', 'run.sh'), 'utf8')).toBe('#!/bin/sh\n')

    const wrappedZip = new AdmZip()
    wrappedZip.addFile('downloaded-repo/skills/example/SKILL.md', Buffer.from('---\nname: imported-example\ndescription: Test\n---\n# Wrapped\n'))
    wrappedZip.addFile('downloaded-repo/skills/example/references/info.md', Buffer.from('reference\n'))
    await expect(importSkillsZip(wrappedZip.toBuffer(), codexHome)).resolves.toEqual({ installed: ['imported-example'] })
    expect(await readFile(join(codexHome, 'skills', 'imported-example', 'references', 'info.md'), 'utf8')).toBe('reference\n')
  })

  it('imports several independent skill folders from one ZIP', async () => {
    const codexHome = await fixture()
    const zip = new AdmZip()
    zip.addFile('bundle/alpha/SKILL.md', Buffer.from('---\nname: alpha\ndescription: Test\n---\n'))
    zip.addFile('bundle/beta/SKILL.md', Buffer.from('---\nname: beta\ndescription: Test\n---\n'))
    await expect(importSkillsZip(zip.toBuffer(), codexHome)).resolves.toEqual({ installed: ['alpha', 'beta'] })
  })

  it('rejects unsafe, invalid, nested, and existing skill imports', async () => {
    const codexHome = await fixture()

    const missingName = new AdmZip()
    missingName.addFile('SKILL.md', Buffer.from('---\ndescription: Missing name\n---\n'))
    await expect(importSkillsZip(missingName.toBuffer(), codexHome)).rejects.toThrow(/missing.*name/iu)

    const nested = new AdmZip()
    nested.addFile('SKILL.md', Buffer.from('---\nname: parent\ndescription: Parent\n---\n'))
    nested.addFile('child/SKILL.md', Buffer.from('---\nname: child\ndescription: Child\n---\n'))
    await expect(importSkillsZip(nested.toBuffer(), codexHome)).rejects.toThrow(/nested/iu)

    const existing = new AdmZip()
    existing.addFile('SKILL.md', Buffer.from('---\nname: demo\ndescription: Existing\n---\n'))
    await expect(importSkillsZip(existing.toBuffer(), codexHome)).rejects.toThrow(/already installed/iu)
  })
})
