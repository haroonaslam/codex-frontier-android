import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { browseFrontierFiles, getFrontierFileRoots, writeFrontierFile } from './frontierFiles'

async function fixture(): Promise<string> {
  const appHome = await mkdtemp(join(tmpdir(), 'frontier-files-'))
  const codexHome = join(appHome, 'runtime', '.codex')
  await mkdir(join(codexHome, 'skills', 'demo'), { recursive: true })
  await mkdir(join(codexHome, 'memory'), { recursive: true })
  await mkdir(join(codexHome, 'memories'), { recursive: true })
  await writeFile(join(appHome, 'AGENTS.md'), '# Instructions\n', 'utf8')
  await writeFile(join(codexHome, 'config.toml'), 'model = "gpt"\n', 'utf8')
  await writeFile(join(codexHome, 'skills', 'demo', 'SKILL.md'), '# Demo\n', 'utf8')
  return codexHome
}

describe('Frontier file workspace', () => {
  it('exposes only the explicit non-secret roots', async () => {
    const codexHome = await fixture()
    expect(getFrontierFileRoots(codexHome).map((root) => root.id)).toEqual([
      'instructions', 'memory', 'memories', 'skills', 'config',
    ])
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
