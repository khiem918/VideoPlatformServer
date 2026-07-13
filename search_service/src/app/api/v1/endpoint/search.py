from fastapi import APIRouter
from fastapi import Depends
from src.app.container import container
from src.core.dependency import get_current_user
from src.domain.entity.search_respone import SearchResponseList


router = APIRouter(
    prefix="/search",
    tags=["search"],
)

@router.get ('/{query}', response_model=SearchResponseList)
async def search(query: str, userId: str = Depends(get_current_user)) -> SearchResponseList:

    result = await container.search_service.search(query, userId)    
    return SearchResponseList(data=result)