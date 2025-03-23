from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI()

# Настройка CORS для разрешения запросов с фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене замените на конкретный домен
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Получаем бинарные данные
            data = await websocket.receive_bytes()
            
            # Преобразуем байты обратно в float32 массив
            audio_array = np.frombuffer(data, dtype=np.float32)
            
            # Здесь будет ваша логика обработки аудио
            # Пока что просто отправляем подтверждение
            await websocket.send_json({
                "status": "success",
                "message": f"Получено {len(audio_array)} сэмплов аудио"
            })
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await websocket.close()

@app.get("/")
async def root():
    return {"message": "Voice Training API is running"}
