from pydantic import BaseModel
from typing import TypedDict 

class SearchResponseList(BaseModel):
    data: list[SearchResponse]
    cursor: int | None = None
    
class SearchResponse(BaseModel):
    video_id: str
    title: str
    description: str
    thumbnail_url: str
    view: int
    date: int
    channel: str    

class VideoMetadata(TypedDict):
    video_id: str
    title: str
    description: str
    thumbnail_url: str
    view: int
    date: int
    channel: str
