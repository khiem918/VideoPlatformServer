from pydantic import BaseModel
from typing import List, Optional

class TagProcessRequest(BaseModel):
    videoId: str
    textToEmbed: str 
    isQuery: Optional[bool] = False

class EmbeddingResponse(BaseModel):
    videoId: str
    vector: List[float]
    
class SummarizeRequest(BaseModel):
    text: str
