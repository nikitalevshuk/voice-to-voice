import { useState, useCallback } from 'react'
import { Button, VStack, Text, useToast, HStack } from '@chakra-ui/react'
import { FaMicrophone } from 'react-icons/fa'
import { useVAD } from '../hooks/useVAD'
import { useWebSocket } from '../hooks/useWebSocket'

const WEBSOCKET_URL = 'ws://localhost:8000/ws'

const ChatInterface = () => {
  const [isRecording, setIsRecording] = useState(false)
  const toast = useToast()

  const handleSpeechStart = useCallback(() => {
    toast({
      title: "Речь обнаружена",
      description: "Говорите...",
      status: "info",
      duration: 1000,
      isClosable: true,
    })
  }, [toast])

  const handleSpeechEnd = useCallback(() => {
    toast({
      title: "Речь завершена",
      description: "Обработка...",
      status: "info",
      duration: 1000,
      isClosable: true,
    })
  }, [toast])

  const handleWebSocketMessage = useCallback((data: any) => {
    // Здесь будем обрабатывать ответы от сервера
    console.log('Получен ответ от сервера:', data)
  }, [])

  const handleWebSocketOpen = useCallback(() => {
    toast({
      title: "Соединение установлено",
      description: "Подключено к серверу",
      status: "success",
      duration: 2000,
      isClosable: true,
    })
  }, [toast])

  const handleWebSocketError = useCallback((error: Event) => {
    toast({
      title: "Ошибка соединения",
      description: "Не удалось подключиться к серверу",
      status: "error",
      duration: 3000,
      isClosable: true,
    })
  }, [toast])

  const { isConnected, error: wsError, sendBinaryData } = useWebSocket({
    url: WEBSOCKET_URL,
    onMessage: handleWebSocketMessage,
    onOpen: handleWebSocketOpen,
    onError: handleWebSocketError,
  })

  const handleAudioData = useCallback((audio: Float32Array) => {
    // Конвертируем Float32Array в ArrayBuffer для отправки через WebSocket
    const buffer = new ArrayBuffer(audio.length * 4) // 4 bytes per float
    const view = new Float32Array(buffer)
    view.set(audio)
    sendBinaryData(buffer)
  }, [sendBinaryData])

  const { isLoading, isListening, error: vadError, startListening, stopListening } = useVAD({
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
    onAudioData: handleAudioData,
  })

  const handleStartConversation = async () => {
    try {
      if (!isConnected) {
        throw new Error('WebSocket не подключен')
      }
      await startListening()
      setIsRecording(true)
      
      toast({
        title: "Разговор начат",
        description: "Говорите в микрофон",
        status: "success",
        duration: 3000,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось начать запись",
        status: "error",
        duration: 3000,
        isClosable: true,
      })
      console.error('Error starting recording:', error)
    }
  }

  const handleStopConversation = async () => {
    await stopListening()
    setIsRecording(false)
  }

  const error = vadError || wsError

  if (error) {
    return (
      <VStack spacing={4} width="100%" align="center">
        <Text color="red.500">
          Ошибка: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
        </Text>
      </VStack>
    )
  }

  return (
    <VStack spacing={4} width="100%" align="center">
      <Text fontSize="2xl" fontWeight="bold">
        Голосовой тренажер
      </Text>
      
      <HStack>
        <Button
          leftIcon={<FaMicrophone />}
          colorScheme={isListening ? "red" : "blue"}
          size="lg"
          onClick={isListening ? handleStopConversation : handleStartConversation}
          isDisabled={isLoading || !isConnected}
          isLoading={isLoading}
        >
          {isLoading ? "Загрузка..." : isListening ? "Остановить запись" : "Начать разговор"}
        </Button>
      </HStack>

      {!isConnected && (
        <Text color="orange.500">
          Подключение к серверу...
        </Text>
      )}

      {isListening && (
        <Text color="gray.600">
          Говорите в микрофон...
        </Text>
      )}
    </VStack>
  )
}

export default ChatInterface 