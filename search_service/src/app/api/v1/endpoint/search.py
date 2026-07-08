from fastapi import APIRouter
from fastapi import Depends
from src.app import container
from core.dependency import get_current_user
from domain.entity.search_respone import SearchResponseList


router = APIRouter(
    prefix="/search",
    tags=["search"],
)

@router.get ('/{query}', response_model=SearchResponseList)
async def search(query: str, userId: str = Depends(get_current_user)) -> SearchResponseList:

    result = await container.search_service.search(query, userId)    
    return SearchResponseList(data=result)