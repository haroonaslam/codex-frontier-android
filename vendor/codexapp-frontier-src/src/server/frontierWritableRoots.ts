import { constants as fsConstants } from 'node:fs'
import { access, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path'

const ROOTS_FILE_NAME = 'frontier-writable-roots.json'
const MAX_WRITABLE_ROOTS = 32

export type FrontierWritableRoot = {
  path: string
  label: string
  readable: boolean
  writable: boolean
}

type StoredRoots = {
  version: 1
  roots: string[]
}

function getCodexHome(codexHomeOverride?: string): string {
  const candidate = codexHomeOverride?.trim() || process.env.CODEX_HOME?.trim()
  if (!candidate || !isAbsolute(candidate)) throw new Error('Writable roots require an absolute CODEX_HOME.')
  return resolve(candidate)
}

function rootsFile(codexHomeOverride?: string): string {
  return resolve(getCodexHome(codexHomeOverride), ROOTS_FILE_NAME)
}

function termuxHome(codexHomeOverride?: string): string {
  return dirname(dirname(dirname(getCodexHome(codexHomeOverride))))
}

function isInside(base: string, target: string): boolean {
  return target === base || target.startsWith(`${base}${sep}`)
}

function protectedRoots(codexHomeOverride?: string): { exact: string[]; sensitive: string[] } {
  const codexHome = getCodexHome(codexHomeOverride)
  const home = termuxHome(codexHomeOverride)
  const appHome = dirname(dirname(codexHome))
  return {
    exact: ['/', '/data', '/data/data', '/data/data/com.termux', '/data/data/com.termux/files', home],
    sensitive: [appHome, codexHome, resolve(home, '.ssh'), resolve(home, '.gnupg')],
  }
}

async function readStoredRoots(codexHomeOverride?: string): Promise<string[]> {
  try {
    const payload = JSON.parse(await readFile(rootsFile(codexHomeOverride), 'utf8')) as Partial<StoredRoots>
    return Array.isArray(payload.roots) ? payload.roots.filter((entry): entry is string => typeof entry === 'string') : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error('The writable-roots configuration is not readable JSON.')
  }
}

function readStoredRootsSync(codexHomeOverride?: string): string[] {
  try {
    const payload = JSON.parse(readFileSync(rootsFile(codexHomeOverride), 'utf8')) as Partial<StoredRoots>
    return Array.isArray(payload.roots) ? payload.roots.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

async function writeStoredRoots(roots: string[], codexHomeOverride?: string): Promise<void> {
  const destination = rootsFile(codexHomeOverride)
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, `${JSON.stringify({ version: 1, roots }, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, destination)
}

async function permissionState(path: string): Promise<{ readable: boolean; writable: boolean }> {
  let readable = false
  let writable = false
  try { await access(path, fsConstants.R_OK); readable = true } catch { /* unavailable */ }
  try { await access(path, fsConstants.W_OK); writable = true } catch { /* unavailable */ }
  return { readable, writable }
}

async function normalizeRoot(candidate: string, codexHomeOverride?: string): Promise<string> {
  const trimmed = candidate.trim()
  if (!trimmed || !isAbsolute(trimmed)) throw new Error('Choose an absolute folder path.')
  let canonical: string
  try {
    canonical = await realpath(resolve(trimmed))
  } catch {
    throw new Error('That folder does not exist or Termux cannot reach it.')
  }
  const info = await lstat(canonical)
  if (!info.isDirectory()) throw new Error('Writable roots must be folders.')
  const protectedPaths = protectedRoots(codexHomeOverride)
  if (protectedPaths.exact.includes(canonical)) {
    throw new Error('Choose a specific project or shared-storage folder, not a system or Termux root.')
  }
  for (const protectedPath of protectedPaths.sensitive) {
    if (isInside(protectedPath, canonical)) {
      throw new Error('Choose a specific project or shared-storage folder, not a system, credential, or Frontier runtime root.')
    }
    if (isInside(canonical, protectedPath)) {
      throw new Error('This folder contains protected Termux or Frontier data. Choose a narrower folder.')
    }
  }
  const permissions = await permissionState(canonical)
  if (!permissions.readable || !permissions.writable) {
    throw new Error('Termux must have both read and write access to this folder.')
  }
  return canonical
}

export async function listFrontierWritableRoots(codexHomeOverride?: string): Promise<FrontierWritableRoot[]> {
  const roots = await readStoredRoots(codexHomeOverride)
  return Promise.all(roots.map(async (path) => ({
    path,
    label: basename(path) || path,
    ...await permissionState(path),
  })))
}

export function listFrontierWritableRootPathsSync(codexHomeOverride?: string): string[] {
  return readStoredRootsSync(codexHomeOverride)
}

export async function addFrontierWritableRoot(candidate: string, codexHomeOverride?: string): Promise<FrontierWritableRoot[]> {
  const canonical = await normalizeRoot(candidate, codexHomeOverride)
  const current = await readStoredRoots(codexHomeOverride)
  if (!current.includes(canonical)) {
    if (current.length >= MAX_WRITABLE_ROOTS) throw new Error(`Frontier supports at most ${MAX_WRITABLE_ROOTS} additional roots.`)
    await writeStoredRoots([...current, canonical], codexHomeOverride)
  }
  return listFrontierWritableRoots(codexHomeOverride)
}

export async function removeFrontierWritableRoot(candidate: string, codexHomeOverride?: string): Promise<FrontierWritableRoot[]> {
  const canonical = resolve(candidate.trim())
  const current = await readStoredRoots(codexHomeOverride)
  await writeStoredRoots(current.filter((entry) => entry !== canonical), codexHomeOverride)
  return listFrontierWritableRoots(codexHomeOverride)
}

export async function browseFrontierRootFolders(
  candidate?: string,
  codexHomeOverride?: string,
): Promise<{ path: string; parent: string | null; entries: Array<{ name: string; path: string }> }> {
  const home = termuxHome(codexHomeOverride)
  const start = candidate?.trim() || resolve(home, 'storage', 'shared')
  if (!isAbsolute(start)) throw new Error('Expected an absolute folder path.')
  const canonical = await realpath(resolve(start))
  const info = await lstat(canonical)
  if (!info.isDirectory()) throw new Error('Expected a folder.')
  await access(canonical, fsConstants.R_OK)
  const directoryEntries = await readdir(canonical, { withFileTypes: true })
  const entries: Array<{ name: string; path: string }> = []
  for (const entry of directoryEntries) {
    if (entry.name.startsWith('.')) continue
    const entryPath = resolve(canonical, entry.name)
    try {
      const resolvedEntry = await realpath(entryPath)
      if ((await lstat(resolvedEntry)).isDirectory()) entries.push({ name: entry.name, path: resolvedEntry })
    } catch { /* inaccessible folders are omitted */ }
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
  const parentPath = dirname(canonical)
  return { path: canonical, parent: parentPath === canonical ? null : parentPath, entries }
}

export function suggestedFrontierRootPaths(codexHomeOverride?: string): string[] {
  const home = termuxHome(codexHomeOverride)
  return [
    resolve(home, 'storage', 'downloads'),
    resolve(home, 'storage', 'pictures'),
    resolve(home, 'storage', 'dcim'),
    resolve(home, 'storage', 'shared'),
  ]
}
