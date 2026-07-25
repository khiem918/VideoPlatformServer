from unittest.mock import MagicMock

import pytest

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


class TestEmbedMethodsBug:
    async def test_bug_embed_dense_raises_type_error_because_await_list_is_invalid(
        self,
    ):
        service = EmbeddingService()
        service._dense_model = MagicMock()
        service._dense_model.embed.return_value = [FakeVector([0.1, 0.2])]

        with pytest.raises(TypeError, match="object can't be awaited"):
            await service.embed_dense("some text")

    async def test_bug_embed_sparse_raises_type_error_because_await_list_is_invalid(
        self,
    ):
        service = EmbeddingService()
        service._sparse_model = MagicMock()
        sparse_result = MagicMock()
        sparse_result.indices.tolist.return_value = [0, 1]
        sparse_result.values.tolist.return_value = [0.5, 0.6]
        service._sparse_model.embed.return_value = [sparse_result]

        with pytest.raises(TypeError, match="object can't be awaited"):
            await service.embed_sparse("some query")

    async def test_bug_embed_query_raises_type_error_because_await_list_is_invalid(
        self,
    ):
        service = EmbeddingService()
        service._dense_model = MagicMock()
        service._dense_model.embed.return_value = [FakeVector([0.3, 0.4])]

        with pytest.raises(TypeError, match="object can't be awaited"):
            await service.embed_query("some query")
