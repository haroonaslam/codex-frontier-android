<template>
  <div class="frontier-files-backdrop" role="presentation" @click="emit('close')">
    <section class="frontier-files-panel" role="dialog" aria-modal="true" aria-label="Frontier files" @click.stop>
      <header class="frontier-files-header">
        <div>
          <h2>Frontier files</h2>
          <p>Edit instructions, memory, skills, and non-secret Codex settings.</p>
        </div>
        <button type="button" class="frontier-files-close" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <div class="frontier-files-body">
        <nav class="frontier-files-roots" aria-label="File areas">
          <button
            v-for="root in roots"
            :key="root.id"
            type="button"
            :class="{ 'is-active': selectedRoot?.id === root.id }"
            @click="openRoot(root)"
          >
            <strong>{{ root.label }}</strong>
            <span>{{ root.description }}</span>
          </button>
        </nav>

        <main class="frontier-files-workspace">
          <div class="frontier-files-toolbar">
            <button v-if="selectedRoot" type="button" @click="goBack">← Back</button>
            <span class="frontier-files-location">{{ locationLabel }}</span>
            <span v-if="statusText" class="frontier-files-toolbar-status" role="status">{{ statusText }}</span>
            <button
              v-if="selectedRoot?.id === 'skills'"
              type="button"
              class="is-primary"
              :disabled="isImporting"
              @click="chooseSkillZip"
            >
              {{ isImporting ? 'Importing…' : 'Import ZIP' }}
            </button>
            <button v-if="view?.kind === 'file'" type="button" class="is-primary" :disabled="isSaving" @click="saveFile">
              {{ isSaving ? 'Saving…' : 'Save' }}
            </button>
            <input ref="skillZipInput" class="frontier-files-hidden-input" type="file" accept=".zip,application/zip,application/x-zip-compressed" @change="importSkillZip">
          </div>

          <p v-if="errorText" class="frontier-files-error" role="alert">{{ errorText }}</p>
          <p v-else-if="isLoading" class="frontier-files-state">Loading…</p>
          <div v-else-if="!selectedRoot" class="frontier-files-intro">
            <strong>Choose a file area.</strong>
            <span>Authentication, chats, logs, and other sensitive runtime files are deliberately hidden.</span>
          </div>
          <div v-else-if="view?.kind === 'directory'" class="frontier-files-list">
            <button
              v-for="entry in view.entries"
              :key="entry.path"
              type="button"
              :disabled="!entry.isDirectory && !entry.editable"
              @click="openEntry(entry)"
            >
              <span class="frontier-files-entry-icon">{{ entry.isDirectory ? '▸' : '≡' }}</span>
              <span>{{ entry.name }}{{ entry.isDirectory ? '/' : '' }}</span>
              <small v-if="!entry.isDirectory && !entry.editable">Not editable</small>
            </button>
            <p v-if="view.entries.length === 0" class="frontier-files-state">This folder is empty.</p>
          </div>
          <textarea
            v-else-if="view?.kind === 'file'"
            v-model="editorContent"
            class="frontier-files-editor"
            spellcheck="false"
            autocapitalize="none"
            aria-label="File contents"
          />
        </main>
      </div>
      <footer v-if="statusText" class="frontier-files-status" role="status">{{ statusText }}</footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Root = { id: string; label: string; description: string; kind: 'directory' | 'file' }
type Entry = { name: string; path: string; isDirectory: boolean; editable: boolean }
type DirectoryView = { kind: 'directory'; path: string; entries: Entry[] }
type FileView = { kind: 'file'; path: string; content: string }

const emit = defineEmits<{ close: []; skillsChanged: [] }>()
const roots = ref<Root[]>([])
const selectedRoot = ref<Root | null>(null)
const view = ref<DirectoryView | FileView | null>(null)
const editorContent = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const isImporting = ref(false)
const skillZipInput = ref<HTMLInputElement | null>(null)
const errorText = ref('')
const statusText = ref('')

const locationLabel = computed(() => {
  if (!selectedRoot.value) return 'Safe editor'
  const path = view.value?.path
  return path ? `${selectedRoot.value.label} / ${path}` : selectedRoot.value.label
})

async function fetchView(root: Root, path = ''): Promise<void> {
  isLoading.value = true
  errorText.value = ''
  statusText.value = ''
  try {
    const query = new URLSearchParams({ root: root.id, path })
    const response = await fetch(`/frontier-files-api?${query.toString()}`)
    const payload = await response.json() as (DirectoryView | FileView) & { error?: string }
    if (!response.ok) throw new Error(payload.error || 'Unable to open this file area.')
    view.value = payload
    editorContent.value = payload.kind === 'file' ? payload.content : ''
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Unable to open this file area.'
  } finally {
    isLoading.value = false
  }
}

function openRoot(root: Root): void {
  selectedRoot.value = root
  void fetchView(root)
}

function openEntry(entry: Entry): void {
  if (!selectedRoot.value || (!entry.isDirectory && !entry.editable)) return
  void fetchView(selectedRoot.value, entry.path)
}

function goBack(): void {
  const root = selectedRoot.value
  if (!root) return
  const path = view.value?.path ?? ''
  if (!path || root.kind === 'file') {
    selectedRoot.value = null
    view.value = null
    editorContent.value = ''
    return
  }
  const parentPath = path.split('/').slice(0, -1).join('/')
  void fetchView(root, parentPath)
}

async function saveFile(): Promise<void> {
  if (!selectedRoot.value || view.value?.kind !== 'file') return
  isSaving.value = true
  errorText.value = ''
  statusText.value = 'Saving…'
  try {
    const response = await fetch('/frontier-files-api', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: selectedRoot.value.id, path: view.value.path, content: editorContent.value }),
    })
    const payload = await response.json() as { ok?: boolean; error?: string }
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Save failed.')
    statusText.value = 'Saved'
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Save failed.'
    statusText.value = ''
  } finally {
    isSaving.value = false
  }
}

function chooseSkillZip(): void {
  skillZipInput.value?.click()
}

async function importSkillZip(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !selectedRoot.value) return
  isImporting.value = true
  errorText.value = ''
  statusText.value = 'Importing skill ZIP…'
  try {
    const response = await fetch('/frontier-files-api/skills/import-zip', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/zip' },
      body: file,
    })
    const payload = await response.json() as { ok?: boolean; installed?: string[]; error?: string }
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Skill ZIP import failed.')
    const installed = payload.installed ?? []
    statusText.value = installed.length === 1
      ? `Installed ${installed[0]}`
      : `Installed ${installed.length} skills: ${installed.join(', ')}`
    await fetchView(selectedRoot.value)
    statusText.value = installed.length === 1
      ? `Installed ${installed[0]}`
      : `Installed ${installed.length} skills: ${installed.join(', ')}`
    emit('skillsChanged')
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Skill ZIP import failed.'
    statusText.value = ''
  } finally {
    isImporting.value = false
  }
}

onMounted(async () => {
  isLoading.value = true
  try {
    const response = await fetch('/frontier-files-api')
    const payload = await response.json() as { entries?: Root[]; error?: string }
    if (!response.ok) throw new Error(payload.error || 'Unable to load Frontier files.')
    roots.value = payload.entries ?? []
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Unable to load Frontier files.'
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
@reference "tailwindcss";

.frontier-files-backdrop { @apply fixed inset-0 z-[180] flex items-center justify-center bg-black/55 p-3; }
.frontier-files-panel { @apply flex h-[min(820px,calc(100dvh-24px))] w-[min(1040px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl; }
.frontier-files-header { @apply flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3; }
.frontier-files-header h2 { @apply m-0 text-lg font-semibold; }
.frontier-files-header p { @apply m-0 mt-1 text-sm text-zinc-500; }
.frontier-files-close { @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-2xl text-zinc-500 hover:bg-zinc-100; }
.frontier-files-body { @apply grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)]; }
.frontier-files-roots { @apply flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-2; }
.frontier-files-roots button { @apply flex flex-col rounded-xl border-0 bg-transparent px-3 py-2 text-left hover:bg-zinc-200/60; }
.frontier-files-roots button.is-active { @apply bg-zinc-200; }
.frontier-files-roots strong { @apply text-sm; }
.frontier-files-roots span { @apply mt-0.5 text-xs text-zinc-500; }
.frontier-files-workspace { @apply flex min-h-0 min-w-0 flex-col; }
.frontier-files-toolbar { @apply flex min-h-12 items-center gap-2 border-b border-zinc-200 px-3; }
.frontier-files-toolbar button { @apply whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50; }
.frontier-files-toolbar button.is-primary { @apply border-blue-600 bg-blue-600 text-white hover:bg-blue-700; }
.frontier-files-location { @apply min-w-0 flex-1 truncate text-sm text-zinc-600; }
.frontier-files-toolbar-status { @apply shrink-0 text-sm text-zinc-500; }
.frontier-files-list { @apply flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2; }
.frontier-files-list button { @apply flex min-h-11 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-sm hover:bg-zinc-100 disabled:text-zinc-400; }
.frontier-files-list small { @apply ml-auto text-xs text-zinc-400; }
.frontier-files-entry-icon { @apply w-5 text-center text-zinc-500; }
.frontier-files-hidden-input { @apply hidden; }
.frontier-files-editor { @apply min-h-0 flex-1 resize-none border-0 bg-zinc-950 p-4 font-mono text-[13px] leading-5 text-zinc-100 outline-none; }
.frontier-files-intro { @apply flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-zinc-500; }
.frontier-files-intro strong { @apply text-zinc-800; }
.frontier-files-state { @apply m-0 p-4 text-sm text-zinc-500; }
.frontier-files-error { @apply m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700; }
.frontier-files-status { @apply border-t border-zinc-200 px-4 py-2 text-sm text-zinc-500; }

:global(:root.dark) .frontier-files-panel { @apply border-zinc-700 bg-zinc-900 text-zinc-100; }
:global(:root.dark) .frontier-files-header,
:global(:root.dark) .frontier-files-toolbar,
:global(:root.dark) .frontier-files-status { @apply border-zinc-700; }
:global(:root.dark) .frontier-files-header p,
:global(:root.dark) .frontier-files-roots span,
:global(:root.dark) .frontier-files-location,
:global(:root.dark) .frontier-files-toolbar-status,
:global(:root.dark) .frontier-files-state,
:global(:root.dark) .frontier-files-status { @apply text-zinc-400; }
:global(:root.dark) .frontier-files-roots { @apply border-zinc-700 bg-zinc-950; }
:global(:root.dark) .frontier-files-roots button:hover,
:global(:root.dark) .frontier-files-roots button.is-active,
:global(:root.dark) .frontier-files-list button:hover { @apply bg-zinc-800; }
:global(:root.dark) .frontier-files-toolbar button { @apply border-zinc-700 bg-zinc-900; }
:global(:root.dark) .frontier-files-intro strong { @apply text-zinc-200; }

@media (max-width: 700px) {
  .frontier-files-backdrop { @apply p-0; }
  .frontier-files-panel { @apply h-[100dvh] w-screen rounded-none border-0; }
  .frontier-files-body { @apply grid-cols-1 grid-rows-[auto_minmax(0,1fr)]; }
  .frontier-files-roots { @apply flex-row overflow-x-auto border-b border-r-0 p-2; }
  .frontier-files-roots button { @apply min-w-36 shrink-0; }
  .frontier-files-toolbar-status { @apply hidden; }
}
</style>
