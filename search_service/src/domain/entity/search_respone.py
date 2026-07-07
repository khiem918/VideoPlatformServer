from pydantic import BaseModel
from typing import TypedDict 

class SearchResponseList(BaseModel):
    data: list[SearchResponse]

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
