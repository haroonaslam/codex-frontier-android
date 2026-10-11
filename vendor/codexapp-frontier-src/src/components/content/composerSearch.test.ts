import { describe, expect, it } from 'vitest'
import {
  buildComposerCompositionPreview,
  filterComposerOptions,
  findActiveComposerToken,
} from './composerSearch'

const options = [
  { value: '/plugins/kickoff/SKILL.md', label: 'project-kickoff', description: 'Assign project roles', badgeLabel: 'Plugin' },
  { value: '/skills/roleplay/SKILL.md', label: 'roleplay', description: 'Character writing', badgeLabel: 'User' },
  { value: '/plugins/research/SKILL.md', label: 'rscodefx', description: 'Research mode', badgeLabel: 'Plugin' },
]

describe('filterComposerOptions', () => {
  it('matches labels, descriptions, badges, and paths case-insensitively', () => {
    expect(filterComposerOptions(options, 'ROLE')).toEqual([options[1], options[0]])
    expect(filterComposerOptions(options, 'research plugin')).toEqual([options[2]])
    expect(filterComposerOptions(options, 'skills role')).toEqual([options[1]])
  })

  it('ranks skill-name matches ahead of description-only matches', () => {
    expect(filterComposerOptions(options, 'role').map((option) => option.label)).toEqual([
      'roleplay',
      'project-kickoff',
    ])
  })
})

describe('findActiveComposerToken', () => {
  it('finds skill tokens at the cursor', () => {
    expect(findActiveComposerToken('Please use $role', 16, '$')).toEqual({ start: 11, query: 'role' })
  })

  it('does not match a completed token away from the cursor', () => {
    expect(findActiveComposerToken('$role please', 12, '$')).toBeNull()
  })
})

describe('buildComposerCompositionPreview', () => {
  it('exposes an Android IME word before the keyboard commits it with a space', () => {
    const preview = buildComposerCompositionPreview('$', 1, 1, 'qwen')
    expect(preview).toEqual({ text: '$qwen', cursor: 5 })
    expect(findActiveComposerToken(preview.text, preview.cursor, '$')).toEqual({
      start: 0,
      query: 'qwen',
    })
  })

  it('supports keyboards that compose the prefix and query together', () => {
    const preview = buildComposerCompositionPreview('', 0, 0, '$qwen')
    expect(findActiveComposerToken(preview.text, preview.cursor, '$')).toEqual({
      start: 0,
      query: 'qwen',
    })
  })
})
