import { computed, onBeforeUnmount, ref } from 'vue'
import {
  startThreadRealtime,
  stopThreadRealtime,
  subscribeCodexNotifications,
  type RpcNotification,
} from '../api/codexGateway'

export type RealtimeVoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'
export type RealtimeVoiceTranscriptLine = {
  id: number
  role: 'user' | 'assistant'
  text: string
}

const LIVE_MODEL = 'gpt-live-1-codex'
const NEW_THREAD_CONTEXT_ID = '__new-thread__'
export const REALTIME_VOICES = [
  'juniper',
  'maple',
  'spruce',
  'ember',
  'vale',
  'breeze',
  'arbor',
  'sol',
  'cove',
] as const
export type RealtimeVoice = typeof REALTIME_VOICES[number]

export function normalizeRealtimeVoice(value: unknown): RealtimeVoice {
  return typeof value === 'string' && REALTIME_VOICES.includes(value as RealtimeVoice)
    ? value as RealtimeVoice
    : 'cove'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function realtimeNotificationThreadId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  return typeof params?.threadId === 'string' ? params.threadId : ''
}

export function realtimeTranscriptRole(value: unknown): 'user' | 'assistant' | null {
  return value === 'user' || value === 'assistant' ? value : null
}

export function useRealtimeVoice(options: { getThreadId: () => string; getVoice?: () => string }) {
  const state = ref<RealtimeVoiceState>('idle')
  const errorText = ref('')
  const transcriptLines = ref<RealtimeVoiceTranscriptLine[]>([])
  const partialTranscript = ref<{ role: 'user' | 'assistant'; text: string } | null>(null)
  const isSupported = ref(
    typeof window !== 'undefined'
      && typeof RTCPeerConnection !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia,
  )

  let peerConnection: RTCPeerConnection | null = null
  let microphoneStream: MediaStream | null = null
  let remoteAudio: HTMLAudioElement | null = null
  let eventChannel: RTCDataChannel | null = null
  let unsubscribeNotifications: (() => void) | null = null
  let activeThreadId = ''
  let transcriptSequence = 0
  let stopping = false

  const isActive = computed(() => state.value !== 'idle' && state.value !== 'error')
  const canStart = computed(() => {
    const threadId = options.getThreadId().trim()
    return isSupported.value && threadId.length > 0 && threadId !== NEW_THREAD_CONTEXT_ID
  })

  function resetMedia(): void {
    eventChannel?.close()
    eventChannel = null
    peerConnection?.close()
    peerConnection = null
    microphoneStream?.getTracks().forEach((track) => track.stop())
    microphoneStream = null
    if (remoteAudio) {
      remoteAudio.pause()
      remoteAudio.srcObject = null
      remoteAudio.remove()
      remoteAudio = null
    }
  }

  function resetSession(): void {
    unsubscribeNotifications?.()
    unsubscribeNotifications = null
    resetMedia()
    activeThreadId = ''
    partialTranscript.value = null
  }

  function failSession(message: string): void {
    const threadId = activeThreadId
    errorText.value = message
    state.value = 'error'
    resetSession()
    if (threadId) void stopThreadRealtime(threadId).catch(() => {})
  }

  function appendFinalTranscript(role: 'user' | 'assistant', text: string): void {
    const normalized = text.trim()
    partialTranscript.value = null
    if (!normalized) return
    const previous = transcriptLines.value.at(-1)
    if (previous?.role === role && previous.text === normalized) return
    transcriptSequence += 1
    transcriptLines.value = [
      ...transcriptLines.value.slice(-7),
      { id: transcriptSequence, role, text: normalized },
    ]
  }

  function handleDataChannelMessage(event: MessageEvent<string>): void {
    let payload: Record<string, unknown> | null = null
    try {
      payload = asRecord(JSON.parse(String(event.data)) as unknown)
    } catch {
      return
    }
    const type = typeof payload?.type === 'string' ? payload.type : ''
    if (type.includes('output_audio') || type.includes('output_transcript')) {
      state.value = 'speaking'
    } else if (type.includes('input_audio') || type.includes('input_transcript') || type.endsWith('.done')) {
      state.value = 'listening'
    }
  }

  async function applyRemoteSdp(sdp: string): Promise<void> {
    if (!peerConnection || !sdp.trim()) return
    await peerConnection.setRemoteDescription({ type: 'answer', sdp })
  }

  function handleNotification(notification: RpcNotification): void {
    if (!activeThreadId || realtimeNotificationThreadId(notification) !== activeThreadId) return
    const params = asRecord(notification.params)

    if (notification.method === 'thread/realtime/sdp') {
      const sdp = typeof params?.sdp === 'string' ? params.sdp : ''
      void applyRemoteSdp(sdp).catch((error: unknown) => {
        failSession(error instanceof Error ? error.message : 'Could not apply the Live Voice connection.')
      })
      return
    }

    if (notification.method === 'thread/realtime/transcript/delta') {
      const role = realtimeTranscriptRole(params?.role)
      const delta = typeof params?.delta === 'string' ? params.delta : ''
      if (role && delta) {
        const previous = partialTranscript.value?.role === role ? partialTranscript.value.text : ''
        partialTranscript.value = { role, text: `${previous}${delta}` }
        state.value = role === 'assistant' ? 'speaking' : 'listening'
      }
      return
    }

    if (notification.method === 'thread/realtime/transcript/done') {
      const role = realtimeTranscriptRole(params?.role)
      const text = typeof params?.text === 'string' ? params.text : ''
      if (role) appendFinalTranscript(role, text)
      state.value = role === 'assistant' ? 'speaking' : 'listening'
      return
    }

    if (notification.method === 'thread/realtime/error') {
      failSession(typeof params?.message === 'string' && params.message.trim()
        ? params.message
        : 'Live Voice encountered an error.')
      return
    }

    if (notification.method === 'thread/realtime/closed') {
      resetSession()
      if (!stopping) state.value = 'idle'
    }
  }

  async function start(): Promise<void> {
    if (!canStart.value || state.value === 'connecting' || isActive.value) return
    const threadId = options.getThreadId().trim()
    const voice = normalizeRealtimeVoice(options.getVoice?.())
    errorText.value = ''
    transcriptLines.value = []
    partialTranscript.value = null
    state.value = 'connecting'
    activeThreadId = threadId
    stopping = false

    try {
      unsubscribeNotifications = subscribeCodexNotifications(handleNotification)
      // Android System WebView can reject desktop-oriented audio constraints on
      // otherwise valid microphones. Let WebRTC negotiate the phone's native
      // capture format; the realtime service applies its own voice processing.
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true })

      peerConnection = new RTCPeerConnection()
      remoteAudio = document.createElement('audio')
      remoteAudio.autoplay = true
      remoteAudio.setAttribute('playsinline', '')
      remoteAudio.style.display = 'none'
      document.body.appendChild(remoteAudio)

      peerConnection.ontrack = (event) => {
        if (!remoteAudio) return
        remoteAudio.srcObject = event.streams[0] ?? new MediaStream([event.track])
        void remoteAudio.play().catch(() => {
          // The session starts from a user gesture, but some WebViews still defer autoplay.
        })
      }
      peerConnection.onconnectionstatechange = () => {
        const connectionState = peerConnection?.connectionState
        if (connectionState === 'connected') state.value = 'listening'
        if (connectionState === 'failed' || connectionState === 'disconnected') {
          failSession('Live Voice connection was lost.')
        }
      }

      for (const track of microphoneStream.getAudioTracks()) {
        peerConnection.addTrack(track, microphoneStream)
      }
      eventChannel = peerConnection.createDataChannel('oai-events')
      eventChannel.onmessage = handleDataChannelMessage

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      const sdp = peerConnection.localDescription?.sdp ?? offer.sdp
      if (!sdp) throw new Error('Live Voice could not create a WebRTC offer.')

      await startThreadRealtime({
        threadId,
        clientManagedHandoffs: false,
        flushTranscriptTailOnSessionEnd: true,
        model: LIVE_MODEL,
        outputModality: 'audio',
        includeStartupContext: true,
        realtimeStartInstructions: 'Use Live Voice for a concise spoken conversation while delegating coding and tool work to this Codex thread.',
        transport: { type: 'webrtc', sdp },
        version: 'v3',
        voice,
      })
    } catch (error) {
      failSession(error instanceof DOMException
        ? `${error.name}: ${error.message}`
        : error instanceof Error ? error.message : 'Live Voice could not start.')
    }
  }

  async function stop(): Promise<void> {
    const threadId = activeThreadId
    if (!threadId) {
      resetSession()
      state.value = 'idle'
      errorText.value = ''
      return
    }
    stopping = true
    try {
      await stopThreadRealtime(threadId)
    } catch {
      // Local media still must be released if the backend session already closed.
    } finally {
      resetSession()
      state.value = 'idle'
      errorText.value = ''
      stopping = false
    }
  }

  function clearError(): void {
    if (state.value === 'error') state.value = 'idle'
    errorText.value = ''
  }

  onBeforeUnmount(() => {
    const threadId = activeThreadId
    resetSession()
    if (threadId) void stopThreadRealtime(threadId).catch(() => {})
  })

  return {
    state,
    errorText,
    transcriptLines,
    partialTranscript,
    isSupported,
    isActive,
    canStart,
    start,
    stop,
    clearError,
  }
}
