import logging
import httpx
from openai import OpenAI

logger = logging.getLogger(__name__)

class TTSProcessor:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = OpenAI(api_key=api_key)
        
    async def text_to_speech_stream(self, text: str):
        """
        Конвертирует текст в аудио и возвращает его чанками
        
        Args:
            text (str): Текст для преобразования в речь
            
        Yields:
            bytes: Чанки аудио данных
        """
        try:
            logger.info(f"Начинаем преобразование текста в речь: '{text[:50]}...'")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
            }

            payload = {
                "model": "tts-1-hd",
                "voice": "onyx",
                "input": text,
                "stream": True
            }

            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    "https://api.openai.com/v1/audio/speech",
                    headers=headers,
                    json=payload,
                ) as response:
                    with open("output_stream.opus", "wb") as audio_file:
                        async for chunk in response.aiter_bytes():
                            yield chunk
        except Exception as e:
            logger.error(f"Ошибка при преобразовании текста в речь: {str(e)}")
            raise
