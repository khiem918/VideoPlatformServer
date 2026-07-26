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