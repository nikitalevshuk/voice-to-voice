from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import logging
from datetime import datetime
from backend.app.core.speech import SpeechToText
from backend.app.core.llm import LLMProcessor
from backend.app.core.tts import TTSProcessor
import os
import io

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Настройка CORS для разрешения запросов с фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене замените на конкретный домен
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация сервисов
api_key = os.getenv("OPENAI_API_KEY")
speech_to_text = SpeechToText(api_key=api_key)
llm_processor = LLMProcessor(api_key=api_key)
tts_processor = TTSProcessor(api_key=api_key)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    logger.info(f"Новое WebSocket подключение. ID клиента: {client_id}")
    
    await websocket.accept()
    logger.info(f"Клиент {client_id}: соединение установлено")
    
    try:
        while True:
            # Получаем бинарные данные
            data = await websocket.receive_bytes()
            
            # Преобразуем байты обратно в float32 массив
            audio_array = np.frombuffer(data, dtype=np.float32)
            
            # Логируем информацию о полученных данных
            logger.info(
                f"Клиент {client_id}: получены аудио данные\n"
                f"  - Размер данных: {len(data)} байт\n"
                f"  - Количество сэмплов: {len(audio_array)}\n"
                f"  - Длительность: {len(audio_array)/16000:.2f}с"
            )
            
            try:
                # Преобразуем аудио в текст
                text = await speech_to_text.convert_audio_to_text(audio_array)
                
                if text.strip():  # Если есть распознанный текст
                    logger.info(f"Распознанный текст: {text}")
                    
                    # Отправляем текст в LLM
                    llm_response = await llm_processor.process_text(text)
                    logger.info(f"Ответ LLM: {llm_response}")
                    
                    # Отправляем подтверждение клиенту о начале генерации аудио
                    await websocket.send_json({
                        "status": "processing",
                        "type": "conversation",
                        "user_text": text,
                        "assistant_text": llm_response
                    })
                    
                    # Группируем чанки для более плавного воспроизведения
                    CHUNK_GROUP_SIZE = 25  # Увеличиваем размер группы с 5 до 15 чанков
                    chunk_counter = 0
                    current_group = []
                    
                    async for audio_chunk in tts_processor.text_to_speech_stream(llm_response):
                        current_group.append(audio_chunk)
                        
                        # Когда накопили достаточно чанков, отправляем их как один большой чанк
                        if len(current_group) >= CHUNK_GROUP_SIZE:
                            chunk_counter += 1
                            # Объединяем все чанки в один
                            combined_chunk = b''.join(current_group)
                            chunk_size = len(combined_chunk)
                            
                            logger.info(f"Отправка сгруппированного аудио чанка #{chunk_counter}, "
                                      f"размер: {chunk_size} байт (объединено {len(current_group)} маленьких чанков)")
                            
                            # Отправляем информацию о чанке
                            await websocket.send_json({
                                "status": "streaming",
                                "type": "audio_stream",
                                "chunk_number": chunk_counter,
                                "chunk_size": chunk_size
                            })
                            
                            # Отправляем объединенный чанк
                            await websocket.send_bytes(combined_chunk)
                            current_group = []  # Очищаем группу
                    
                    # Отправляем оставшиеся чанки, если они есть
                    if current_group:
                        chunk_counter += 1
                        combined_chunk = b''.join(current_group)
                        chunk_size = len(combined_chunk)
                        
                        logger.info(f"Отправка финального сгруппированного чанка #{chunk_counter}, "
                                  f"размер: {chunk_size} байт (объединено {len(current_group)} маленьких чанков)")
                        
                        await websocket.send_json({
                            "status": "streaming",
                            "type": "audio_stream",
                            "chunk_number": chunk_counter,
                            "chunk_size": chunk_size
                        })
                        
                        await websocket.send_bytes(combined_chunk)
                    
                    # Отправляем сигнал о завершении аудио
                    logger.info(f"Стриминг аудио завершен, отправлено {chunk_counter} сгруппированных чанков")
                    await websocket.send_json({
                        "status": "complete",
                        "type": "audio_stream",
                        "total_chunks": chunk_counter
                    })
                    
            except Exception as e:
                logger.error(f"Ошибка при обработке: {str(e)}")
                await websocket.send_json({
                    "status": "error",
                    "type": "processing",
                    "error": str(e)
                })
            
    except Exception as e:
        logger.error(f"Клиент {client_id}: ошибка при обработке данных - {str(e)}")
    finally:
        logger.info(f"Клиент {client_id}: соединение закрыто")
        await websocket.close()

@app.get("/")
async def root():
    return {"message": "Voice Training API is running"}
