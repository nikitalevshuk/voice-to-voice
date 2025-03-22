import { useState, useCallback } from 'react'
import { Button, VStack, Text, useToast } from '@chakra-ui/react'
import { FaMicrophone } from 'react-icons/fa'
import { useVAD } from '../hooks/useVAD'

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

  const { isLoading, isListening, error, startListening, stopListening } = useVAD({
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
  })

  const handleStartConversation = async () => {
    try {
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
        description: "Не удалось начать запись",
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

  if (error) {
    return (
      <VStack spacing={4} width="100%" align="center">
        <Text color="red.500">
          Ошибка: {error.message}
        </Text>
      </VStack>
    )
  }

  return (
    <VStack spacing={4} width="100%" align="center">
      <Text fontSize="2xl" fontWeight="bold">
        Голосовой тренажер
      </Text>
      
      <Button
        leftIcon={<FaMicrophone />}
        colorScheme={isListening ? "red" : "blue"}
        size="lg"
        onClick={isListening ? handleStopConversation : handleStartConversation}
        isDisabled={isLoading}
        isLoading={isLoading}
      >
        {isLoading ? "Загрузка..." : isListening ? "Остановить запись" : "Начать разговор"}
      </Button>

      {isListening && (
        <Text color="gray.600">
          Говорите в микрофон...
        </Text>
      )}
    </VStack>
  )
}

export default ChatInterface 