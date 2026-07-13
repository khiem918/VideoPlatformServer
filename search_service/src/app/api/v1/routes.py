from fastapi import APIRouter

from src.app.api.v1.endpoint.search import router as search_router

routers = APIRouter() 
router_list = [search_router]

for r in router_list:
    routers.include_router(r)


    