from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import logging
from datetime import datetime
from backend.app.core.speech import SpeechToText
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

# Инициализация Speech-to-Text
speech_to_text = SpeechToText(api_key=os.getenv("OPENAI_API_KEY"))

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
            
            # Обрабатываем аудио через Speech-to-Text
            try:
                text = await speech_to_text.convert_audio_to_text(audio_array)
                if text.strip():  # Если есть распознанный текст
                    await websocket.send_json({
                        "status": "success",
                        "type": "transcription",
                        "text": text,
                    })
            except Exception as e:
                logger.error(f"Ошибка при распознавании речи: {str(e)}")
                await websocket.send_json({
                    "status": "error",
                    "type": "transcription",
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
