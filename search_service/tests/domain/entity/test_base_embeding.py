import pytest
from qdrant_client.http.models import SparseVector

from src.domain.entity.base_embeding import BaseEmbedding


class TestBaseEmbedding:
    def test_cannot_instantiate_abstract_class_directly(self):
        with pytest.raises(TypeError):
            BaseEmbedding()

    def test_concrete_subclass_implementing_all_methods_can_be_instantiated(self):
        class ConcreteEmbedding(BaseEmbedding):
            def embed_dense(self, text: str) -> list[float]:
                return [0.1]

            def embed_sparse(self, query: str) -> SparseVector:
                return SparseVector(indices=[0], values=[1.0])

            def embed_query(self, query: str) -> list[float]:
                return [0.2]

        instance = ConcreteEmbedding()

        assert instance.embed_dense("x") == [0.1]
        assert instance.embed_query("x") == [0.2]

    def test_subclass_missing_a_method_cannot_be_instantiated(self):
        class IncompleteEmbedding(BaseEmbedding):
            def embed_dense(self, text: str) -> list[float]:
                return [0.1]

        with pytest.raises(TypeError):
            IncompleteEmbedding()
