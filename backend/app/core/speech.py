import io
import logging
from openai import OpenAI
import numpy as np
import tempfile
import soundfile
import os

logger = logging.getLogger(__name__)

class SpeechToText:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
        
    async def convert_audio_to_text(self, audio_data: np.ndarray, sample_rate: int = 16000) -> str:
        """
        Конвертирует аудио данные в текст используя OpenAI API
        
        Args:
            audio_data (np.ndarray): Аудио данные в формате float32
            sample_rate (int): Частота дискретизации (по умолчанию 16000 Hz)
            
        Returns:
            str: Распознанный текст
        """
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                soundfile.write(temp_file.name, audio_data, sample_rate)
                
                with open(temp_file.name, "rb") as audio_file:
                    temp_file_path = temp_file.name

                    transcription = self.client.audio.transcriptions.create(
                        model="gpt-4o-mini-transcribe",
                        file=audio_file,
                        language="ru",
                    )
                
            os.remove(temp_file_path)

            logger.info(f"Успешно распознан текст: {transcription.text}")
            return transcription.text
            
        except Exception as e:
            logger.error(f"Ошибка при конвертации аудио в текст: {str(e)}")
            raise
