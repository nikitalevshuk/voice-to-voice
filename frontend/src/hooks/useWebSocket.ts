import { useEffect, useCallback, useRef, useState } from 'react'

interface UseWebSocketProps {
  url: string
  onMessage?: (data: any) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
}

export const useWebSocket = ({
  url,
  onMessage,
  onOpen,
  onClose,
  onError
}: UseWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Event | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
      setError(null)
      onOpen?.()
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
      onClose?.()
    }

    ws.onerror = (error: Event) => {
      console.error('WebSocket error:', error)
      setError(error)
      onError?.(error)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      console.log('WebSocket message received:', data)
      onMessage?.(data)
    }

    wsRef.current = ws

    return () => {
      ws.close()
    }
  }, [url, onMessage, onOpen, onClose, onError])

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    } else {
      console.error('WebSocket is not connected')
    }
  }, [])

  const sendBinaryData = useCallback((data: ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    } else {
      console.error('WebSocket is not connected')
    }
  }, [])

  return {
    isConnected,
    error,
    sendMessage,
    sendBinaryData
  }
} 