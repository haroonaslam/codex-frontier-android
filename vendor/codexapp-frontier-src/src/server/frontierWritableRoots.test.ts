import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addFrontierWritableRoot,
  browseFrontierRootFolders,
  listFrontierWritableRootPathsSync,
  listFrontierWritableRoots,
  removeFrontierWritableRoot,
} from './frontierWritableRoots'

async function fixture(): Promise<{ codexHome: string; project: string }> {
  const termuxHome = await mkdtemp(join(tmpdir(), 'frontier-roots-'))
  const codexHome = join(termuxHome, 'codex-subscription-isolated-app', 'runtime', '.codex')
  const project = join(termuxHome, 'projects', 'demo')
  await mkdir(codexHome, { recursive: true })
  await mkdir(join(project, 'child'), { recursive: true })
  return { codexHome, project }
}

describe('Frontier writable roots', () => {
  it('adds, lists, and removes an accessible directory', async () => {
    const { codexHome, project } = await fixture()
    const added = await addFrontierWritableRoot(project, codexHome)
    expect(added).toMatchObject([{ path: project, readable: true, writable: true }])
    expect(listFrontierWritableRootPathsSync(codexHome)).toEqual([project])
    expect(await removeFrontierWritableRoot(project, codexHome)).toEqual([])
    expect(await listFrontierWritableRoots(codexHome)).toEqual([])
  })

  it('browses only directories and refuses protected Frontier data', async () => {
    const { codexHome, project } = await fixture()
    const view = await browseFrontierRootFolders(project, codexHome)
    expect(view.entries).toEqual([{ name: 'child', path: join(project, 'child') }])
    await expect(addFrontierWritableRoot(codexHome, codexHome)).rejects.toThrow(/protected|Frontier/iu)
  })
})
