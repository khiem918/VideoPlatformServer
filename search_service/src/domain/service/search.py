from src.infrastructure.redis.redis import RedisService
from src.domain.entity.search_respone import SearchResponseList
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService
from src.infrastructure.grpc.grpc_client import GrpcClient

class SearchService:
    def __init__(self, embedding_service, qdrant_service, redis_service, grpc_service):
        self.embedding_service : EmbeddingService = embedding_service
        self.qdrant_service : QdrantService = qdrant_service
        self.redis_service : RedisService = redis_service
        self.grpc_service : GrpcClient = grpc_service


    """
    searching process: query -> embedding -> search in qdrant 
                        -> list[video_id] sorted by descending score -> get video metadata from redis 
                        -> if not hit, get video metadata by gRPC -> cache in redis -> return video metadata list
    """
    async def search(self, query: str, userId: str) -> SearchResponseList:
        
        #---------------Handle searching algorithm---------------------------------------------

        query_dense_vector = await self.embedding_service.embed_query(query)
        sparse_vector = await self.embedding_service.embed_sparse(query)

        search_results = await self.qdrant_service.search_points(query_dense_vector, sparse_vector, userId)

        ids = [result.id for result in search_results]


        #------------------Handle reponse------------------------------------------------
        
        metadata_list = await self.redis_service.mget([f"metadata:{id}" for id in ids])

        cached_ids = []
        uncached_ids = []

        for id, metadata in zip(ids, metadata_list):
            
            if metadata is None:
                uncached_ids.append(id)        
                continue
                
            if metadata:
                cached_ids.append(id)
                continue
        
        uncached_data = await self.grpc_service.get_video_metadata(uncached_ids)
         
        return SearchResponseList(
            cached_metadata=[metadata for metadata in metadata_list if metadata is not None],
            uncached_metadata=uncached_data
        )