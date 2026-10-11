export type SearchableComposerOption = {
  value: string
  label: string
  description?: string
  badgeLabel?: string
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD')
}

export function filterComposerOptions<T extends SearchableComposerOption>(
  options: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchText(query).trim()
  const terms = normalizedQuery.split(/\s+/u).filter(Boolean)
  if (terms.length === 0) return options

  return options.map((option, index) => {
    const label = normalizeSearchText(option.label)
    const value = normalizeSearchText(option.value)
    const haystack = normalizeSearchText([
      option.label,
      option.description ?? '',
      option.badgeLabel ?? '',
      option.value,
    ].join(' '))
    if (!terms.every((term) => haystack.includes(term))) return null

    let score = 4
    if (label === normalizedQuery) score = 0
    else if (label.startsWith(normalizedQuery)) score = 1
    else if (terms.every((term) => label.includes(term))) score = 2
    else if (value.includes(normalizedQuery)) score = 3
    return { option, index, score }
  }).filter((match): match is { option: T; index: number; score: number } => match !== null)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ option }) => option)
}

export type ComposerTokenMatch = {
  start: number
  query: string
}

export type ComposerCompositionPreview = {
  text: string
  cursor: number
}

export function buildComposerCompositionPreview(
  baseText: string,
  selectionStart: number,
  selectionEnd: number,
  compositionText: string,
): ComposerCompositionPreview {
  const start = Math.max(0, Math.min(selectionStart, baseText.length))
  const end = Math.max(start, Math.min(selectionEnd, baseText.length))
  return {
    text: `${baseText.slice(0, start)}${compositionText}${baseText.slice(end)}`,
    cursor: start + compositionText.length,
  }
}

export function findActiveComposerToken(
  text: string,
  cursor: number,
  prefix: '@' | '$',
): ComposerTokenMatch | null {
  const beforeCursor = text.slice(0, cursor)
  const escapedPrefix = prefix === '$' ? '\\$' : '@'
  const match = beforeCursor.match(new RegExp(`(^|\\s)(${escapedPrefix}[^\\s${escapedPrefix}]*)$`, 'u'))
  const token = match?.[2]
  if (!token) return null
  return {
    start: cursor - token.length,
    query: token.slice(1),
  }
}
