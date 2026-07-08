import logging
import os
import tempfile
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "small")
CHUNK_WINDOW_SECONDS = int(os.getenv("CHUNK_WINDOW_SECONDS", "25"))
NO_SPEECH_THRESHOLD = float(os.getenv("NO_SPEECH_THRESHOLD", "0.6"))


class TranscriptionService:
    def __init__(self):
        self._model: WhisperModel | None = None

    def load_model(self):
        if self._model is None:
            logger.info(f"Loading Whisper model: {WHISPER_MODEL_SIZE}")
            self._model = WhisperModel(
                WHISPER_MODEL_SIZE,
                device="cpu",
                compute_type="int8",
            )
            logger.info("Whisper model loaded successfully")

    # ─────────────────────────────────────────────
    # Transcribe
    # ─────────────────────────────────────────────

    def transcribe(self, audio_path: str, language: str = "vi"):
        """
        Transcribe file audio, trả về list segment từ Whisper.
        Trả về list rỗng nếu không phát hiện lời nói.

        Args:
            audio_path: đường dẫn file audio (.wav, .mp3...)
            language:   ngôn ngữ chính của video (mặc định tiếng Việt)
        """
        if self._model is None:
            raise RuntimeError("Whisper model chưa được load. Gọi load_model() trước.")

        segments, info = self._model.transcribe(audio_path, language=language)
        segments = list(segments)

        logger.info(
            f"Transcribed {audio_path}: "
            f"language={info.language}, segments={len(segments)}"
        )
        return segments

    # ─────────────────────────────────────────────
    # Chunking
    # ─────────────────────────────────────────────

    def merge_segments_to_chunks(
        self,
        segments: list,
        window_seconds: int = CHUNK_WINDOW_SECONDS,
    ) -> list[dict]:
        """
        Gộp các segment Whisper thành chunk ~window_seconds giây.
        Mỗi chunk là 1 đơn vị sẽ được embed và lưu vào Qdrant.

        Returns:
            list[dict]: mỗi dict gồm { text, start, end, no_speech_prob_avg }
        """
        chunks = []
        text_buf, start_buf, end_buf, prob_buf = "", None, None, []

        for seg in segments:
            if start_buf is None:
                start_buf = seg.start
            text_buf += " " + seg.text
            end_buf = seg.end
            prob_buf.append(seg.no_speech_prob)

            if end_buf - start_buf >= window_seconds:
                chunks.append({
                    "text":               text_buf.strip(),
                    "start":              start_buf,
                    "end":                end_buf,
                    "no_speech_prob_avg": sum(prob_buf) / len(prob_buf),
                })
                text_buf, start_buf, prob_buf = "", None, []

        # Phần dư cuối video chưa đủ window_seconds
        if text_buf.strip():
            chunks.append({
                "text":               text_buf.strip(),
                "start":              start_buf,
                "end":                end_buf,
                "no_speech_prob_avg": sum(prob_buf) / len(prob_buf),
            })

        return chunks

    def process_video_transcript(self, segments: list) -> list[dict] | None:
        """
        Xử lý toàn bộ transcript của 1 video.

        Returns:
            list[dict]: các chunk audio nếu có lời nói rõ ràng
            None:       nếu video không có lời nói (0 segment) → cần fallback caption
        """
        if len(segments) == 0:
            logger.info("Không phát hiện lời nói trong video → cần fallback caption")
            return None

        chunks = self.merge_segments_to_chunks(segments)
        logger.info(f"Tạo ra {len(chunks)} chunk từ {len(segments)} segment")
        return chunks

    # ─────────────────────────────────────────────
    # Pipeline chính: audio file → chunks có text + metadata
    # ─────────────────────────────────────────────

    def process_audio_file(
        self,
        audio_path: str,
        video_id: str,
        user_owner: str,
        created_at: int,
        language: str = "vi",
    ) -> list[dict] | None:
        """
        Pipeline đầy đủ từ file audio → list chunk sẵn sàng để embed.

        Args:
            audio_path:  đường dẫn file audio đã extract từ video
            video_id:    ID video trong DB
            user_owner:  ID user sở hữu video (dùng để filter khi search)
            created_at:  unix timestamp lúc index
            language:    ngôn ngữ chính của video

        Returns:
            list[dict]: chunk kèm đầy đủ metadata để upsert vào Qdrant
            None:       nếu không có lời nói → caller cần xử lý fallback caption
        """
        segments = self.transcribe(audio_path, language=language)
        chunks = self.process_video_transcript(segments)

        if chunks is None:
            return None

        # Lọc chunk có no_speech_prob_avg cao (nhạc nền, tiếng ồn)
        valid_chunks = [
            c for c in chunks
            if c["no_speech_prob_avg"] < NO_SPEECH_THRESHOLD
        ]

        if not valid_chunks:
            logger.info(
                f"Tất cả chunk của video {video_id} có no_speech_prob cao "
                f"→ cần fallback caption"
            )
            return None

        # Bổ sung metadata để upsert vào Qdrant
        for chunk in valid_chunks:
            chunk["video_id"]   = video_id
            chunk["user_owner"] = user_owner
            chunk["source"]     = "audio"
            chunk["created_at"] = created_at

        logger.info(
            f"Video {video_id}: {len(valid_chunks)}/{len(chunks)} chunk "
            f"hợp lệ sau khi lọc no_speech_prob"
        )
        return valid_chunks