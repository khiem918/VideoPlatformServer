from unittest.mock import MagicMock

import pytest

from src.domain.service.caption_service import CAPTION_MODEL, CaptionService


class TestLoadModel:
    def test_loads_processor_and_model_with_cpu_device_when_no_cuda(self, mocker):
        mocker.patch("torch.cuda.is_available", return_value=False)
        processor_cls = mocker.patch(
            "src.domain.service.caption_service.BlipProcessor"
        )
        model_cls = mocker.patch(
            "src.domain.service.caption_service.BlipForConditionalGeneration"
        )
        model_instance = MagicMock()
        model_cls.from_pretrained.return_value = model_instance

        service = CaptionService()
        service.load_model()

        processor_cls.from_pretrained.assert_called_once_with(CAPTION_MODEL)
        model_cls.from_pretrained.assert_called_once_with(CAPTION_MODEL)
        model_instance.to.assert_called_once_with("cpu")
        assert service._device == "cpu"

    def test_uses_cuda_device_when_available(self, mocker):
        mocker.patch("torch.cuda.is_available", return_value=True)
        mocker.patch("src.domain.service.caption_service.BlipProcessor")
        model_cls = mocker.patch(
            "src.domain.service.caption_service.BlipForConditionalGeneration"
        )
        model_instance = MagicMock()
        model_cls.from_pretrained.return_value = model_instance

        service = CaptionService()
        service.load_model()

        model_instance.to.assert_called_once_with("cuda")
        assert service._device == "cuda"

    def test_does_not_reload_model_when_already_loaded(self, mocker):
        mocker.patch("torch.cuda.is_available", return_value=False)
        mocker.patch("src.domain.service.caption_service.BlipProcessor")
        model_cls = mocker.patch(
            "src.domain.service.caption_service.BlipForConditionalGeneration"
        )

        service = CaptionService()
        service.load_model()
        service.load_model()

        model_cls.from_pretrained.assert_called_once()


class TestGenerateCaption:
    def test_raises_runtime_error_when_model_not_loaded(self):
        service = CaptionService()

        with pytest.raises(RuntimeError, match="chưa được load"):
            service.generate_caption("frame.jpg")

    def test_returns_decoded_caption_from_model_output(self, mocker):
        mocker.patch(
            "src.domain.service.caption_service.Image.open",
            return_value=MagicMock(convert=MagicMock(return_value="rgb-image")),
        )

        service = CaptionService()
        service._device = "cpu"
        service._processor = MagicMock()
        service._processor.return_value.to.return_value = {"pixel_values": "tensor"}
        service._processor.decode.return_value = "a person talking"
        service._model = MagicMock()
        service._model.generate.return_value = ["token-ids"]

        result = service.generate_caption("frame.jpg")

        assert result == "a person talking"
        service._processor.decode.assert_called_once_with(
            "token-ids", skip_special_tokens=True
        )
