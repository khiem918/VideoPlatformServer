import logging
import os
from pydoc import text
from fastapi import Depends, FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from typing import Dict, List, Optional
from service.embedding_model import EmbeddingService
from typing import Union
from service.summarization_model import SummarizationService
from schemas import TagProcessRequest, EmbeddingResponse, SummarizeRequest


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Platform AI Service")
api_key_header  = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_api_key(api_key: Optional[str] = Security(api_key_header)):
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
summarization_service = SummarizationService()

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": embedding_service.model is not None}

@app.post("/vector/generate", response_model=Union[EmbeddingResponse, List[EmbeddingResponse]])

async def generate_vector(request: Union[TagProcessRequest, List[TagProcessRequest]], api_key: Optional[str] = Depends(get_api_key)):
    try:
        is_list = isinstance(request, list)
        if not is_list:
            request = [request]

        responses = []
        for req in request:

            prefix = "query: " if req.isQuery else "passage: "
            text_to_process = f"{prefix}{req.textToEmbed}"
            vector = embedding_service.generate_embedding(text_to_process)

            responses.append(EmbeddingResponse(
                videoId=req.videoId,
                vector=vector
            ))
            
        return responses if is_list else responses[0]
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    


@app.post("/desc/summarize", response_model=str)
async def summarize_description(request_model: SummarizeRequest, api_key: Optional[str] = Depends(get_api_key)):
    try: 
        return summarization_service.summarize(request_model.text)
    except Exception as e:
        logger.error(f"Error summarizing text: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    


