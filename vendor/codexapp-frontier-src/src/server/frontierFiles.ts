import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { lstat, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { isTextEditableFile } from './localBrowseUi.js'

export type FrontierFileRootId = 'globalInstructions' | 'workspaceInstructions' | 'development' | 'memory' | 'memories' | 'skills' | 'config'

export type FrontierFileRoot = {
  id: FrontierFileRootId
  label: string
  description: string
  kind: 'directory' | 'file'
  path: string
}

export type FrontierFileEntry = {
  name: string
  path: string
  isDirectory: boolean
  editable: boolean
}

const MAX_EDITABLE_BYTES = 2 * 1024 * 1024

function getCodexHome(codexHomeOverride?: string): string {
  const codexHome = codexHomeOverride?.trim() || process.env.CODEX_HOME?.trim()
  if (!codexHome || !isAbsolute(codexHome)) {
    throw new Error('Frontier file editing requires an absolute CODEX_HOME.')
  }
  return resolve(codexHome)
}

export function getFrontierFileRoots(codexHomeOverride?: string): FrontierFileRoot[] {
  const codexHome = getCodexHome(codexHomeOverride)
  const appHome = dirname(dirname(codexHome))
  const termuxHome = dirname(appHome)
  const configuredWorkspace = process.env.CODEX_FRONTIER_WORKSPACE?.trim()
  const userWorkspace = configuredWorkspace && isAbsolute(configuredWorkspace)
    ? resolve(configuredWorkspace)
    : resolve(termuxHome, 'codex-workspace')
  return [
    {
      id: 'globalInstructions',
      label: 'Global instructions',
      description: 'AGENTS.md applied across every project',
      kind: 'file',
      path: resolve(codexHome, 'AGENTS.md'),
    },
    {
      id: 'workspaceInstructions',
      label: 'Workspace instructions',
      description: 'Defaults for the Frontier workspace',
      kind: 'file',
      path: resolve(userWorkspace, 'AGENTS.md'),
    },
    {
      id: 'development',
      label: 'Frontier development',
      description: 'Reference for explicitly requested app maintenance',
      kind: 'file',
      path: resolve(codexHome, 'DEVELOPMENT.md'),
    },
    {
      id: 'memory',
      label: 'Memory',
      description: 'Persistent Frontier memory files',
      kind: 'directory',
      path: resolve(codexHome, 'memory'),
    },
    {
      id: 'memories',
      label: 'Generated memories',
      description: 'Codex-generated memory files',
      kind: 'directory',
      path: resolve(codexHome, 'memories'),
    },
    {
      id: 'skills',
      label: 'Skills',
      description: 'Installed Frontier skills',
      kind: 'directory',
      path: resolve(codexHome, 'skills'),
    },
    {
      id: 'config',
      label: 'Codex configuration',
      description: 'Non-secret config.toml settings',
      kind: 'file',
      path: resolve(codexHome, 'config.toml'),
    },
  ]
}

function rootById(id: string, codexHomeOverride?: string): FrontierFileRoot {
  const root = getFrontierFileRoots(codexHomeOverride).find((entry) => entry.id === id)
  if (!root) throw new Error('Unknown Frontier file area.')
  return root
}

function isInside(base: string, target: string): boolean {
  return target === base || target.startsWith(`${base}${sep}`)
}

async function resolveAllowedPath(
  rootId: string,
  requestedPath: string,
  codexHomeOverride?: string,
): Promise<{ root: FrontierFileRoot; target: string }> {
  const root = rootById(rootId, codexHomeOverride)
  const normalizedRequest = requestedPath.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
  const target = root.kind === 'file'
    ? root.path
    : resolve(root.path, normalizedRequest || '.')

  if (root.kind === 'directory' && !isInside(root.path, target)) {
    throw new Error('The requested path is outside this Frontier file area.')
  }
  if (root.kind === 'file' && normalizedRequest && normalizedRequest !== root.path.split(sep).at(-1)) {
    throw new Error('The requested file is not available in this Frontier file area.')
  }
  if (root.kind === 'file' && (await lstat(root.path)).isSymbolicLink()) {
    throw new Error('Symbolic links are not available in this Frontier file area.')
  }

  const [realTarget, realRoot] = await Promise.all([
    realpath(target),
    realpath(root.kind === 'file' ? root.path : root.path),
  ])
  if (root.kind === 'directory' && !isInside(realRoot, realTarget)) {
    throw new Error('Symbolic links outside this Frontier file area are not available.')
  }
  if (root.kind === 'file' && realTarget !== realRoot) {
    throw new Error('The requested file is not available in this Frontier file area.')
  }
  return { root, target: realTarget }
}

export async function browseFrontierFiles(
  rootId: string,
  requestedPath = '',
  codexHomeOverride?: string,
): Promise<
  | { kind: 'directory'; root: FrontierFileRoot; path: string; entries: FrontierFileEntry[] }
  | { kind: 'file'; root: FrontierFileRoot; path: string; content: string }
> {
  const { root, target } = await resolveAllowedPath(rootId, requestedPath, codexHomeOverride)
  const targetStat = await stat(target)
  if (targetStat.isFile()) {
    if (targetStat.size > MAX_EDITABLE_BYTES || !(await isTextEditableFile(target))) {
      throw new Error('Only text files up to 2 MB can be opened here.')
    }
    return {
      kind: 'file',
      root,
      path: root.kind === 'file' ? '' : relative(root.path, target).replace(/\\/gu, '/'),
      content: await readFile(target, 'utf8'),
    }
  }
  if (!targetStat.isDirectory() || root.kind !== 'directory') {
    throw new Error('Expected a directory.')
  }

  const directoryEntries = await readdir(target, { withFileTypes: true })
  const entries = await Promise.all(directoryEntries.map(async (entry): Promise<FrontierFileEntry | null> => {
    const entryPath = resolve(target, entry.name)
    const entryLstat = await lstat(entryPath)
    if (entryLstat.isSymbolicLink()) return null
    const isDirectory = entryLstat.isDirectory()
    return {
      name: entry.name,
      path: relative(root.path, entryPath).replace(/\\/gu, '/'),
      isDirectory,
      editable: !isDirectory && entryLstat.size <= MAX_EDITABLE_BYTES && await isTextEditableFile(entryPath),
    }
  }))

  return {
    kind: 'directory',
    root,
    path: relative(root.path, target).replace(/\\/gu, '/'),
    entries: entries
      .filter((entry): entry is FrontierFileEntry => entry !== null)
      .sort((left, right) => {
        if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
      }),
  }
}

export async function writeFrontierFile(
  rootId: string,
  requestedPath: string,
  content: string,
  codexHomeOverride?: string,
): Promise<void> {
  if (Buffer.byteLength(content, 'utf8') > MAX_EDITABLE_BYTES) {
    throw new Error('Files larger than 2 MB cannot be saved here.')
  }
  const { target } = await resolveAllowedPath(rootId, requestedPath, codexHomeOverride)
  const targetStat = await stat(target)
  if (!targetStat.isFile() || !(await isTextEditableFile(target))) {
    throw new Error('Only existing text files can be edited here.')
  }
  await writeFile(target, content, 'utf8')
}
