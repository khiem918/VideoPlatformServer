from fastapi import APIRouter
from fastapi import Depends
from core.dependency import get_current_user
from domain.entity.search_respone import SearchResponseList


router = APIRouter(
    prefix="/search",
    tags=["search"],
)

@router.get ('/{query}')
async def search(query: str, userId: str = Depends(get_current_user)) -> SearchResponseList:
    return SearchResponseList(data=[])