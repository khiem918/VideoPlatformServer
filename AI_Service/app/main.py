import logging
import os
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from typing import Dict, List, Optional
from service.embedding_model import EmbeddingService
from typing import Union

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Platform AI Service")
api_key_header  = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_api_key(api_key: Optional[str] = api_key_header):
    expected_api_key = os.getenv("API_KEY") or "default_api_key"
    if expected_api_key is None:
        logger.warning("API_KEY environment variable is not set. Skipping API key validation.")
        return None
    if api_key == expected_api_key:
        return api_key
    else:
        logger.warning("Invalid API key provided.")
        raise HTTPException(status_code=401, detail="Unauthorized")

embedding_service = EmbeddingService()


class TagProcessRequest(BaseModel):
    videoId: str
    textToEmbed: str 

class EmbeddingResponse(BaseModel):
    videoId: str
    vector: List[float]



@app.on_event("startup")
async def startup_event():
    logger.info("Starting up AI Service...")
    embedding_service.load_model()

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": embedding_service.model is not None}

@app.post("/api/vector/generate", response_model=EmbeddingResponse)
async def generate_vector(request: Union[TagProcessRequest, List[TagProcessRequest]], api_key: Optional[str] = Depends(get_api_key)):
    try:
        if not isinstance(request, list):
            request = [request]

        vectors = []
        for req in request:
            passage_text = f"passage: {req.textToEmbed}"
            vector = embedding_service.generate_embedding(passage_text)
            vectors.append(vector)
            
        return EmbeddingResponse(
            videoId=request.videoId,
            vector=vector
        )
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    
    


