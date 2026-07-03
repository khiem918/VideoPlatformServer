from typing import Literal
from pydantic import BaseModel

class MetaDataCache(BaseModel): 
    video_id: str 
    title: str
    description: str
    thumbnail_url: str      # raw path in bucket
    view: int 
    date: int
    channel: int
    visibility: Literal["DRAFT", "PUBLIC", "PRIVATE"]
