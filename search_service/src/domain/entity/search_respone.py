from pydantic import BaseModel
from typing import TypedDict 

class SearchResponse(BaseModel):
    video_id: str
    title: str
    description: str
    thumbnail_url: str
    view: int
    date: int
    channel: str    
    start: float
    end: float
    matched_text: str
    score: float

class SearchResponseList(BaseModel):
    data: list[SearchResponse]

class VideoMetadata(TypedDict):
    video_id: str
    title: str
    description: str
    thumbnail_url: str
    view: int
    date: int
    channel: str
    visibility: str
