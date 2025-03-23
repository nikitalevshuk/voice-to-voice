import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

class LLMProcessor:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
        
    async def process_text(self, text: str) -> str:
        """
        Отправляет текст в LLM и получает ответ
        
        Args:
            text (str): Текст для обработки
            
        Returns:
            str: Ответ от LLM
        """
        try:
            response = self.client.responses.create(
                model="gpt-4o",
                input=text
            )
            
            logger.info(f"Получен ответ от LLM: {response.output_text}")
            return response.output_text
            
        except Exception as e:
            logger.error(f"Ошибка при обработке текста через LLM: {str(e)}")
            raise
