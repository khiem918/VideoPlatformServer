from fastapi import APIRouter

from src.app.api.v1.endpoint.search import router as search_router
from src.app.api.v1.endpoint.health import router as health_router

routers = APIRouter()
router_list = [search_router, health_router]

for r in router_list:
    r.tags = routers.tags.append("v1")
    routers.include_router(r)


    