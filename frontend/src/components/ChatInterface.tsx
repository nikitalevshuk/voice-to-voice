import { useState, useCallback, useRef, useEffect } from 'react'
import { Button, VStack, Text, useToast, HStack } from '@chakra-ui/react'
import { FaMicrophone } from 'react-icons/fa'
import { useVAD } from '../hooks/useVAD'

const WEBSOCKET_URL = 'ws://localhost:8000/ws'
const MIN_BUFFERS_TO_PLAY = 8  // Увеличиваем минимальное количество буферов до 8
const BUFFER_AHEAD_TIME = 1.0  // Увеличиваем время планирования до 1 секунды

interface AudioMessage {
    status: 'processing' | 'streaming' | 'complete' | 'error'
    type: 'conversation' | 'audio_stream'
    user_text?: string
    assistant_text?: string
    chunk_number?: number
    chunk_size?: number
    total_chunks?: number
    error?: string
}

interface ScheduledAudio {
    source: AudioBufferSourceNode;
    startTime: number;
    duration: number;
}

const ChatInterface = () => {
    const [isRecording, setIsRecording] = useState(false)
    const [conversation, setConversation] = useState<{ user: string; assistant: string }[]>([])
    const toast = useToast()
    const wsRef = useRef<WebSocket | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioBuffersRef = useRef<AudioBuffer[]>([])
    const scheduledAudioRef = useRef<ScheduledAudio[]>([])
    const nextStartTimeRef = useRef<number>(0)
    const isFirstChunkRef = useRef<boolean>(true)
    const isPlayingRef = useRef<boolean>(false)

    // Функция для планирования и воспроизведения буферов
    const scheduleNextBuffers = useCallback(() => {
        if (!audioContextRef.current || audioBuffersRef.current.length === 0 || !isPlayingRef.current) {
            return
        }

        const currentTime = audioContextRef.current.currentTime
        
        // Очищаем прошедшие буферы из списка запланированных
        scheduledAudioRef.current = scheduledAudioRef.current.filter(
            scheduled => scheduled.startTime + scheduled.duration > currentTime
        )

        // Проверяем, нужно ли планировать новые буферы
        const lastScheduledTime = scheduledAudioRef.current.length > 0
            ? scheduledAudioRef.current[scheduledAudioRef.current.length - 1].startTime
            : currentTime

        if (lastScheduledTime - currentTime < BUFFER_AHEAD_TIME) {
            // Планируем следующий буфер
            const audioBuffer = audioBuffersRef.current.shift()
            if (audioBuffer) {
                const source = audioContextRef.current.createBufferSource()
                source.buffer = audioBuffer
                source.connect(audioContextRef.current.destination)

                const startTime = Math.max(
                    currentTime,
                    lastScheduledTime,
                    nextStartTimeRef.current
                )

                const scheduled = {
                    source,
                    startTime,
                    duration: audioBuffer.duration
                }

                scheduledAudioRef.current.push(scheduled)
                nextStartTimeRef.current = startTime + audioBuffer.duration

                source.onended = () => {
                    // Планируем следующие буферы, если они есть
                    if (audioBuffersRef.current.length > 0) {
                        scheduleNextBuffers()
                    } else if (scheduledAudioRef.current.length === 0) {
                        // Если больше нет запланированных буферов, сбрасываем состояние
                        isPlayingRef.current = false
                        isFirstChunkRef.current = true
                    }
                }

                try {
                    source.start(startTime)
                    console.log(`Запланировано воспроизведение буфера на ${startTime.toFixed(3)}с, длительность: ${audioBuffer.duration.toFixed(3)}с`)
                    console.log(`В очереди осталось ${audioBuffersRef.current.length} буферов`)
                } catch (error) {
                    console.error('Ошибка при запуске воспроизведения:', error)
                }
            }
        }
    }, [])

    // Функция для начала воспроизведения
    const startPlayback = useCallback(() => {
        if (!isPlayingRef.current && audioBuffersRef.current.length >= MIN_BUFFERS_TO_PLAY) {
            console.log(`Начинаем воспроизведение, накоплено ${audioBuffersRef.current.length} буферов`)
            isPlayingRef.current = true
            isFirstChunkRef.current = false
            scheduleNextBuffers()
        }
    }, [scheduleNextBuffers])

    // Регулярная проверка и планирование буферов
    useEffect(() => {
        if (!isPlayingRef.current) return

        const intervalId = setInterval(() => {
            scheduleNextBuffers()
        }, 50) // Уменьшаем интервал проверки до 50мс для более частого обновления

        return () => clearInterval(intervalId)
    }, [scheduleNextBuffers])

    // Инициализация WebSocket
    useEffect(() => {
        wsRef.current = new WebSocket(WEBSOCKET_URL)
        
        wsRef.current.onopen = () => {
            toast({
                title: "Соединение установлено",
                status: "success",
                duration: 2000,
            })
        }

        wsRef.current.onclose = () => {
            toast({
                title: "Соединение закрыто",
                status: "warning",
                duration: 2000,
            })
        }

        wsRef.current.onerror = () => {
            toast({
                title: "Ошибка соединения",
                status: "error",
                duration: 2000,
            })
        }

        // Обработка входящих сообщений
        wsRef.current.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                // Получен аудио чанк
                try {
                    if (!audioContextRef.current) {
                        audioContextRef.current = new AudioContext()
                    }

                    const arrayBuffer = await event.data.arrayBuffer()
                    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)
                    
                    // Добавляем буфер в очередь
                    audioBuffersRef.current.push(audioBuffer)
                    console.log(`Добавлен новый буфер, всего в очереди: ${audioBuffersRef.current.length}`)
                    
                    // Если накопили достаточно буферов, начинаем воспроизведение
                    startPlayback()
                } catch (error) {
                    console.error('Ошибка при обработке аудио чанка:', error)
                }
            } else {
                try {
                    // Получено JSON сообщение
                    const message: AudioMessage = JSON.parse(event.data)
                    
                    if (message.type === 'conversation' && message.status === 'processing') {
                        // Обновляем историю разговора
                        setConversation(prev => [...prev, {
                            user: message.user_text || '',
                            assistant: message.assistant_text || ''
                        }])
                        
                        // Останавливаем все текущие источники звука
                        scheduledAudioRef.current.forEach(scheduled => {
                            try {
                                scheduled.source.stop()
                            } catch (e) {
                                // Игнорируем ошибки при остановке
                            }
                        })
                        
                        // Сбрасываем состояние аудио для нового ответа
                        audioBuffersRef.current = []
                        scheduledAudioRef.current = []
                        isPlayingRef.current = false
                        isFirstChunkRef.current = true
                        nextStartTimeRef.current = 0
                    }
                    else if (message.type === 'audio_stream' && message.status === 'streaming') {
                        console.log(`Получен чанк #${message.chunk_number}, размер: ${message.chunk_size} байт`)
                    }
                    else if (message.type === 'audio_stream' && message.status === 'complete') {
                        console.log(`Стриминг завершен, всего чанков: ${message.total_chunks}`)
                    }
                    else if (message.status === 'error') {
                        toast({
                            title: "Ошибка",
                            description: message.error,
                            status: "error",
                            duration: 3000,
                        })
                    }
                } catch (error) {
                    console.error('Ошибка при обработке JSON сообщения:', error)
                }
            }
        }

        return () => {
            // Останавливаем все источники звука при размонтировании
            if (scheduledAudioRef.current.length > 0) {
                scheduledAudioRef.current.forEach(scheduled => {
                    try {
                        scheduled.source.stop()
                    } catch (e) {
                        // Игнорируем ошибки при остановке
                    }
                })
            }
            
            if (wsRef.current) {
                wsRef.current.close()
            }
            if (audioContextRef.current) {
                audioContextRef.current.close()
            }
        }
    }, [toast, startPlayback])

    // Функция для отправки аудио данных на сервер
    const handleAudioData = useCallback((audioData: Float32Array) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket не подключен')
            return
        }

        try {
            // Конвертируем Float32Array в ArrayBuffer для отправки
            const buffer = new ArrayBuffer(audioData.length * 4) // 4 bytes per float
            const view = new Float32Array(buffer)
            view.set(audioData)
            
            // Отправляем данные через WebSocket
            wsRef.current.send(buffer)
        } catch (error) {
            console.error('Ошибка при отправке аудио данных:', error)
        }
    }, [])

    const handleSpeechStart = useCallback(() => {
        toast({
            title: "Речь обнаружена",
            status: "info",
            duration: 1000,
        })
    }, [toast])

    const handleSpeechEnd = useCallback(() => {
        toast({
            title: "Речь завершена",
            status: "info",
            duration: 1000,
        })
    }, [toast])

    const { isLoading, isListening, error: vadError, startListening, stopListening } = useVAD({
        onSpeechStart: handleSpeechStart,
        onSpeechEnd: handleSpeechEnd,
        onAudioData: handleAudioData,
    })

    const handleStartConversation = async () => {
        try {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket не подключен')
            }
            await startListening()
            setIsRecording(true)
            
            toast({
                title: "Разговор начат",
                description: "Говорите в микрофон",
                status: "success",
                duration: 3000,
            })
        } catch (error) {
            toast({
                title: "Ошибка",
                description: error instanceof Error ? error.message : "Не удалось начать запись",
                status: "error",
                duration: 3000,
            })
            console.error('Error starting recording:', error)
        }
    }

    const handleStopConversation = async () => {
        await stopListening()
        setIsRecording(false)
    }

    if (vadError) {
        return (
            <VStack spacing={4} width="100%" align="center">
                <Text color="red.500">
                    Ошибка: {vadError instanceof Error ? vadError.message : 'Неизвестная ошибка'}
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
                    isDisabled={isLoading || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN}
                    isLoading={isLoading}
                >
                    {isLoading ? "Загрузка..." : isListening ? "Остановить запись" : "Начать разговор"}
                </Button>
            </HStack>

            {!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN && (
                <Text color="orange.500">
                    Подключение к серверу...
                </Text>
            )}

            {isListening && (
                <Text color="gray.600">
                    Говорите в микрофон...
                </Text>
            )}

            {/* История разговора */}
            <VStack spacing={4} width="100%" maxW="600px" p={4}>
                {conversation.map((msg, index) => (
                    <VStack key={index} width="100%" align="stretch" spacing={2}>
                        <Text fontWeight="bold">Вы:</Text>
                        <Text bg="gray.100" p={2} borderRadius="md">{msg.user}</Text>
                        <Text fontWeight="bold">Ассистент:</Text>
                        <Text bg="blue.50" p={2} borderRadius="md">{msg.assistant}</Text>
                    </VStack>
                ))}
            </VStack>
        </VStack>
    )
}

export default ChatInterface 