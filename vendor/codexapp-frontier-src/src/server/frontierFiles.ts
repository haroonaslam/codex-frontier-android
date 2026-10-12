import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import AdmZip from 'adm-zip'
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
export const MAX_SKILL_ZIP_BYTES = 20 * 1024 * 1024
const MAX_SKILL_ZIP_ENTRIES = 2_000
const MAX_SKILL_ZIP_FILE_BYTES = 10 * 1024 * 1024
const MAX_SKILL_ZIP_EXPANDED_BYTES = 50 * 1024 * 1024
const MAX_SKILLS_PER_ZIP = 50
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

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
      path: resolve(codexHome, 'skills', 'AGENTS.md'),
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

type NormalizedZipEntry = {
  entry: AdmZip.IZipEntry
  path: string
}

type SkillArchiveRoot = {
  archiveRoot: string
  name: string
}

function normalizeZipEntryPath(rawPath: string): string {
  if (rawPath.includes('\0')) throw new Error('The ZIP contains an invalid file name.')
  const unixPath = rawPath.replace(/\\/gu, '/').replace(/\/+$/gu, '')
  if (!unixPath) return ''
  if (unixPath.startsWith('/') || /^[A-Za-z]:\//u.test(unixPath)) {
    throw new Error('The ZIP contains an absolute path.')
  }
  const parts = unixPath.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('The ZIP contains an unsafe path.')
  }
  return parts.join('/')
}

function isZipSymlink(entry: AdmZip.IZipEntry): boolean {
  return ((entry.attr >>> 16) & 0xf000) === 0xa000
}

function parseSkillName(skillMarkdown: string): string {
  const normalized = skillMarkdown.replace(/^\uFEFF/u, '')
  const lines = normalized.split(/\r?\n/u)
  if (lines[0]?.trim() !== '---') {
    throw new Error('SKILL.md must begin with YAML frontmatter containing a name field.')
  }
  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === '---')
  if (closingIndex < 0) throw new Error('SKILL.md has unterminated YAML frontmatter.')
  const frontmatter = lines.slice(1, closingIndex + 1)
  const nameLine = frontmatter.find((line) => /^\s*name\s*:/u.test(line))
  if (!nameLine) throw new Error('SKILL.md frontmatter is missing the required name field.')
  const rawName = nameLine.replace(/^\s*name\s*:\s*/u, '').trim()
  const name = rawName.replace(/^(?:"([^"]*)"|'([^']*)')$/u, (_match, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted ?? '')
  if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
    throw new Error(`Skill name "${name || rawName}" must use 1-64 lowercase letters, numbers, or single hyphens.`)
  }
  return name
}

function pathBelongsToRoot(entryPath: string, archiveRoot: string): boolean {
  return !archiveRoot || entryPath === archiveRoot || entryPath.startsWith(`${archiveRoot}/`)
}

function relativeToArchiveRoot(entryPath: string, archiveRoot: string): string {
  return archiveRoot ? entryPath.slice(archiveRoot.length).replace(/^\//u, '') : entryPath
}

/**
 * Imports one or more skill folders from a ZIP into CODEX_HOME/skills.
 * Existing skills are never overwritten and all writes are staged first.
 */
export async function importSkillsZip(
  zipBuffer: Buffer,
  codexHomeOverride?: string,
): Promise<{ installed: string[] }> {
  if (!zipBuffer.length) throw new Error('Choose a non-empty ZIP file.')
  if (zipBuffer.length > MAX_SKILL_ZIP_BYTES) throw new Error('Skill ZIP files are limited to 20 MB.')

  let zip: AdmZip
  try {
    zip = new AdmZip(zipBuffer)
  } catch {
    throw new Error('The selected file is not a readable ZIP archive.')
  }

  const rawEntries = zip.getEntries()
  if (rawEntries.length === 0) throw new Error('The ZIP archive is empty.')
  if (rawEntries.length > MAX_SKILL_ZIP_ENTRIES) throw new Error('The ZIP contains too many files.')

  let expandedBytes = 0
  const normalizedEntries: NormalizedZipEntry[] = []
  const seenPaths = new Set<string>()
  for (const entry of rawEntries) {
    if (isZipSymlink(entry)) throw new Error('Skill ZIP files cannot contain symbolic links.')
    const path = normalizeZipEntryPath(entry.entryName)
    if (!path || path.startsWith('__MACOSX/') || path.endsWith('/.DS_Store') || path === '.DS_Store') continue
    if (seenPaths.has(path)) throw new Error(`The ZIP contains a duplicate path: ${path}`)
    seenPaths.add(path)
    if (!entry.isDirectory) {
      if (entry.header.encrypted) throw new Error('Password-protected skill ZIP files are not supported.')
      if (entry.header.size > MAX_SKILL_ZIP_FILE_BYTES) throw new Error(`A ZIP entry is larger than 10 MB: ${path}`)
      expandedBytes += entry.header.size
      if (expandedBytes > MAX_SKILL_ZIP_EXPANDED_BYTES) throw new Error('The ZIP expands beyond the 50 MB safety limit.')
    }
    normalizedEntries.push({ entry, path })
  }

  const skillMarkdownEntries = normalizedEntries.filter(({ entry, path }) => !entry.isDirectory && (path === 'SKILL.md' || path.endsWith('/SKILL.md')))
  if (skillMarkdownEntries.length === 0) throw new Error('No SKILL.md file was found in the ZIP.')
  if (skillMarkdownEntries.length > MAX_SKILLS_PER_ZIP) throw new Error('A ZIP can contain at most 50 skills.')

  const archiveRoots = skillMarkdownEntries.map(({ path }) => path === 'SKILL.md' ? '' : path.slice(0, -'/SKILL.md'.length))
  for (const root of archiveRoots) {
    if (archiveRoots.some((candidate) => candidate !== root && pathBelongsToRoot(candidate, root))) {
      throw new Error('The ZIP contains nested SKILL.md files, so its skill boundaries are ambiguous.')
    }
  }

  const skills: SkillArchiveRoot[] = []
  const seenNames = new Set<string>()
  for (let index = 0; index < skillMarkdownEntries.length; index += 1) {
    const data = skillMarkdownEntries[index]!.entry.getData()
    if (data.length > MAX_EDITABLE_BYTES) throw new Error('SKILL.md files are limited to 2 MB.')
    const name = parseSkillName(data.toString('utf8'))
    if (seenNames.has(name)) throw new Error(`More than one skill in the ZIP declares the name "${name}".`)
    seenNames.add(name)
    skills.push({ archiveRoot: archiveRoots[index]!, name })
  }

  const skillsRoot = resolve(getCodexHome(codexHomeOverride), 'skills')
  await mkdir(skillsRoot, { recursive: true })
  for (const skill of skills) {
    try {
      await lstat(resolve(skillsRoot, skill.name))
      throw new Error(`The skill "${skill.name}" is already installed. Remove it explicitly before importing a replacement.`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  const stagingRoot = await mkdtemp(resolve(skillsRoot, '.frontier-skill-import-'))
  const installedPaths: string[] = []
  try {
    for (const skill of skills) {
      const skillStage = resolve(stagingRoot, skill.name)
      await mkdir(skillStage, { recursive: true })
      const skillEntries = normalizedEntries.filter(({ path }) => pathBelongsToRoot(path, skill.archiveRoot))
      for (const { entry, path } of skillEntries) {
        const relativePath = relativeToArchiveRoot(path, skill.archiveRoot)
        if (!relativePath) continue
        const outputPath = resolve(skillStage, relativePath)
        if (!isInside(skillStage, outputPath)) throw new Error('The ZIP contains an unsafe extraction path.')
        if (entry.isDirectory) {
          await mkdir(outputPath, { recursive: true })
          continue
        }
        const data = entry.getData()
        if (data.length !== entry.header.size) throw new Error(`Unable to verify extracted ZIP entry: ${path}`)
        await mkdir(dirname(outputPath), { recursive: true })
        await writeFile(outputPath, data, { flag: 'wx', mode: 0o600 })
      }
      await lstat(resolve(skillStage, 'SKILL.md'))
    }

    for (const skill of skills) {
      const destination = resolve(skillsRoot, skill.name)
      await rename(resolve(stagingRoot, skill.name), destination)
      installedPaths.push(destination)
    }
    return { installed: skills.map((skill) => skill.name).sort() }
  } catch (error) {
    await Promise.all(installedPaths.map((path) => rm(path, { recursive: true, force: true })))
    throw error
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}
