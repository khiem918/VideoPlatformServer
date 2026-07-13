from fastapi import APIRouter
from fastapi import Depends
from src.app.container import container
from src.core.dependency import get_current_user
from src.domain.entity.search_respone import SearchResponseList
from fastapi import Query

router = APIRouter(
    prefix="/search",
    tags=["search"],
)

@router.get ('', response_model=SearchResponseList)
async def search(
    query: str = Query(..., description="Search query"),
    limit: int = Query(10, description="Response limit"),
    cursor: int | None = Query(None, description="Cursor for pagination"), 
    userId: str = Depends(get_current_user)
) -> SearchResponseList:

    data, next_cursor = await container.search_service.search(userId, query, limit, cursor)
    return SearchResponseList(data=data, cursor=next_cursor)