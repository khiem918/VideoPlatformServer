from unittest.mock import MagicMock

from src.infrastructure.ml_model.embeding_model import (
    DENSE_MODEL,
    SPARSE_MODEL,
    EmbeddingService,
)


class FakeVector:
    def __init__(self, values):
        self._values = values

    def tolist(self):
        return self._values


class TestLoadModel:
    def test_loads_dense_and_sparse_models_with_cpu_provider_when_no_cuda(
        self, mocker
    ):
        mocker.patch(
            "src.infrastructure.ml_model.embeding_model.onnxruntime.get_available_providers",
            return_value=["CPUExecutionProvider"],
        )
        dense_cls = mocker.patch(
            "src.infrastructure.ml_model.embeding_model.TextEmbedding"
        )
        sparse_cls = mocker.patch(
            "src.infrastructure.ml_model.embeding_model.SparseTextEmbedding"
        )

        service = EmbeddingService()
        service.load_model()

        dense_cls.assert_called_once_with(
            provider=["CPUExecutionProvider"], model_name=DENSE_MODEL
        )
        sparse_cls.assert_called_once_with(
            provider=["CPUExecutionProvider"], model_name=SPARSE_MODEL
        )

    def test_uses_cuda_provider_when_available(self, mocker):
        mocker.patch(
            "src.infrastructure.ml_model.embeding_model.onnxruntime.get_available_providers",
            return_value=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        dense_cls = mocker.patch(
            "src.infrastructure.ml_model.embeding_model.TextEmbedding"
        )
        mocker.patch("src.infrastructure.ml_model.embeding_model.SparseTextEmbedding")

        service = EmbeddingService()
        service.load_model()

        dense_cls.assert_called_once_with(
            provider=["CUDAExecutionProvider"], model_name=DENSE_MODEL
        )

    def test_does_not_reload_models_when_already_loaded(self, mocker):
        mocker.patch(
            "src.infrastructure.ml_model.embeding_model.onnxruntime.get_available_providers",
            return_value=["CPUExecutionProvider"],
        )
        dense_cls = mocker.patch(
            "src.infrastructure.ml_model.embeding_model.TextEmbedding"
        )
        mocker.patch("src.infrastructure.ml_model.embeding_model.SparseTextEmbedding")

        service = EmbeddingService()
        service.load_model()
        service.load_model()

        dense_cls.assert_called_once()


class TestEmbedMethods:
    """
    FIXED (previously bug): embed_dense/embed_sparse/embed_query used to
    `await list(self._dense_model.embed(...))`, but fastembed's `.embed()`
    returns a plain sync generator, not an awaitable -- raising
    `TypeError: 'list' object can't be awaited` on every call (see
    src/infrastructure/ml_model/embeding_model.py). Fixed by running the
    sync/CPU-bound `.embed()` call via `asyncio.to_thread` instead of
    awaiting it directly.
    """

    async def test_embed_dense_returns_dense_vector_as_list(self):
        service = EmbeddingService()
        service._dense_model = MagicMock()
        service._dense_model.embed.return_value = [FakeVector([0.1, 0.2])]

        result = await service.embed_dense("some text")

        assert result == [0.1, 0.2]
        service._dense_model.embed.assert_called_once_with(["passage: some text"])

    async def test_embed_sparse_returns_sparse_vector(self):
        service = EmbeddingService()
        service._sparse_model = MagicMock()
        sparse_result = MagicMock()
        sparse_result.indices.tolist.return_value = [0, 1]
        sparse_result.values.tolist.return_value = [0.5, 0.6]
        service._sparse_model.embed.return_value = [sparse_result]

        result = await service.embed_sparse("some query")

        assert result.indices == [0, 1]
        assert result.values == [0.5, 0.6]

    async def test_embed_query_returns_dense_vector_as_list(self):
        service = EmbeddingService()
        service._dense_model = MagicMock()
        service._dense_model.embed.return_value = [FakeVector([0.3, 0.4])]

        result = await service.embed_query("some query")

        assert result == [0.3, 0.4]
        service._dense_model.embed.assert_called_once_with(["query: some query"])
