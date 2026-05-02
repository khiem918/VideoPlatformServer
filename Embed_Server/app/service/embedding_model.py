from sentence_transformers import SentenceTransformer
import torch
import logging

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        self.model_name = 'intfloat/multilingual-e5-base'
        self.model = None

    def load_model(self):

        if self.model is None:
            logger.info(f"Loading '{self.model_name}'...")

            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            logger.info(f"Using device: {device}")
            
            try:
                self.model = SentenceTransformer(self.model_name, device=device)
                logger.info(f"'{self.model_name}' loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load the model: {e}")
                raise e

    def generate_embedding(self, text: str) -> list[float]:
    
        if self.model is None:
            self.load_model()
            
        try:
            embedding = self.model.encode(text, normalize_embeddings=True)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error in generate_embedding: {e}")
            raise e
