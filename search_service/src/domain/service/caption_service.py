import logging
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration

logger = logging.getLogger(__name__)

CAPTION_MODEL = "Salesforce/blip-image-captioning-base"


class CaptionService:
    def __init__(self):
        self._processor: BlipProcessor | None = None
        self._model: BlipForConditionalGeneration | None = None
        self._device = "cpu"

    def load_model(self):
        if self._model is None:
            import torch
            self._device = "cuda" if torch.cuda.is_available() else "cpu"

            logger.info(f"Loading BLIP caption model: {CAPTION_MODEL} (device={self._device})")

            self._processor = BlipProcessor.from_pretrained(CAPTION_MODEL)
            self._model = BlipForConditionalGeneration.from_pretrained(CAPTION_MODEL).to(self._device)

            logger.info("BLIP caption model loaded successfully")

    def generate_caption(self, image_path: str) -> str:
        """
        Sinh caption tiếng Anh cho 1 frame ảnh.

        Args:
            image_path: đường dẫn file ảnh (frame đã extract bằng ffmpeg)

        Returns:
            str: caption mô tả nội dung ảnh
        """
        if self._model is None or self._processor is None:
            raise RuntimeError("BLIP model chưa được load. Gọi load_model() trước.")

        image = Image.open(image_path).convert("RGB")
        inputs = self._processor(image, return_tensors="pt").to(self._device)

        output = self._model.generate(**inputs, max_new_tokens=50)
        caption = self._processor.decode(output[0], skip_special_tokens=True)

        return caption