import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { browseFrontierFiles, getFrontierFileRoots, writeFrontierFile } from './frontierFiles'

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
})
