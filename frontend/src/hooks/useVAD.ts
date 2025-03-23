import { useState, useEffect, useCallback } from 'react'
import { MicVAD } from '@ricky0123/vad-web'

interface UseVADProps {
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
  onAudioData?: (audio: Float32Array) => void
}

export const useVAD = ({ onSpeechStart, onSpeechEnd, onAudioData }: UseVADProps = {}) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [vad, setVad] = useState<MicVAD | null>(null)

  const startListening = useCallback(async () => {
    if (vad) {
      try {
        setIsLoading(true)
        await vad.start()
        setIsListening(true)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to start VAD'))
      } finally {
        setIsLoading(false)
      }
    }
  }, [vad])

  const stopListening = useCallback(async () => {
    if (vad) {
      await vad.pause()
      setIsListening(false)
    }
  }, [vad])

  useEffect(() => {
    const initVAD = async () => {
      try {
        const myvad = await MicVAD.new({
          onSpeechStart: () => {
            console.log('Speech started')
            onSpeechStart?.()
          },
          onSpeechEnd: (audio: Float32Array) => {
            console.log('Speech ended, audio length:', audio.length)
            onAudioData?.(audio)
            onSpeechEnd?.()
          }
        })
        setVad(myvad)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to initialize VAD'))
      }
    }

    initVAD()

    return () => {
      if (vad) {
        vad.pause()
      }
    }
  }, [onSpeechStart, onSpeechEnd, onAudioData])

  return {
    isLoading,
    isListening,
    error,
    startListening,
    stopListening
  }
} 