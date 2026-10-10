import { describe, expect, it } from 'vitest'
import {
  normalizeRealtimeVoice,
  realtimeNotificationThreadId,
  realtimeTranscriptRole,
} from './useRealtimeVoice'

describe('realtime voice notification helpers', () => {
  it('reads the thread id from realtime notifications', () => {
    expect(realtimeNotificationThreadId({
      method: 'thread/realtime/sdp',
      params: { threadId: 'thread-123', sdp: 'answer' },
      atIso: '2026-10-11T00:00:00.000Z',
    })).toBe('thread-123')
  })

  it('rejects notifications without a valid thread id', () => {
    expect(realtimeNotificationThreadId({
      method: 'thread/realtime/error',
      params: { threadId: 123 },
      atIso: '2026-10-11T00:00:00.000Z',
    })).toBe('')
  })

  it('accepts only supported transcript roles', () => {
    expect(realtimeTranscriptRole('user')).toBe('user')
    expect(realtimeTranscriptRole('assistant')).toBe('assistant')
    expect(realtimeTranscriptRole('system')).toBeNull()
  })

  it('keeps supported voices and falls back to cove', () => {
    expect(normalizeRealtimeVoice('juniper')).toBe('juniper')
    expect(normalizeRealtimeVoice('sol')).toBe('sol')
    expect(normalizeRealtimeVoice('unknown')).toBe('cove')
    expect(normalizeRealtimeVoice(null)).toBe('cove')
  })
})
