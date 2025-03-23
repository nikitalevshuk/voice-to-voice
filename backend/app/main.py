from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import logging
from datetime import datetime
from backend.app.core.speech import SpeechToText
from backend.app.core.llm import LLMProcessor
import os

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
                    
                    # Отправляем результат клиенту
                    await websocket.send_json({
                        "status": "success",
                        "type": "conversation",
                        "user_text": text,
                        "assistant_text": llm_response
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
