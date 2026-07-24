from pydantic import BaseModel
from typing import TypedDict, Any

class SearchResponse(BaseModel):
    video_id: str
    title: str
    description: str
    thumbnail_url: str
    view: int
    date: int
    channel: Any  # Sử dụng Any hoặc str | dict để tương thích linh hoạt với dữ liệu từ gRPC
    # Các trường AI Tìm kiếm Ngữ nghĩa từ nhánh feat (HEAD)
    start: float
    end: float
    matched_text: str
    score: float

class SearchResponseList(BaseModel):
    data: list[SearchResponse]
    # Trường hỗ trợ phân trang từ nhánh main
    cursor: int | None = None

class VideoMetadata(TypedDict):
    video_id: str
    title: str
    description: str
    thumbnail_url: str
    view: int
    date: int
    channel: Any
    # Trường lọc quyền riêng tư từ nhánh feat (HEAD)
    visibility: str