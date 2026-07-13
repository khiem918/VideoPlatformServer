import logging
import os
import tempfile
import time
from src.domain.service.transcription_service import TranscriptionService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService
from src.infrastructure.s3.s3_client import S3Client

logger = logging.getLogger(__name__)

SUPPORTED_MIME_TYPES = {
    "video/mp4",
    "video/x-matroska",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
}


class VideoProcessingService:
    def __init__(
        self,
        transcription: TranscriptionService,
        embedding: EmbeddingService,
        chunk_qdrant: ChunkQdrantService,
        s3_client: S3Client,
    ):
        self.transcription  = transcription
        self.embedding      = embedding
        self.chunk_qdrant   = chunk_qdrant
        self.s3_client             = s3_client

    # ─────────────────────────────────────────────
    # Pipeline chính
    # ─────────────────────────────────────────────

    async def process(
        self,
        infor_id:      str,
        processing_id: str,
        r2_path:       str,
        mime_type:     str,
        user_owner:    str,
    ) -> None:
        """
        Pipeline đầy đủ: download video từ R2 → extract audio → Whisper
                         → chunk → embed → upsert Qdrant.

        Args:
            infor_id:      ID video trong DB (dùng làm video_id trong Qdrant)
            processing_id: ID job đang xử lý (dùng để update trạng thái sau này)
            r2_path:       đường dẫn file video trên Cloudflare R2
            mime_type:     MIME type của video (để chọn đúng extension)
            user_owner:    ID user sở hữu video (để filter khi search)
        """
        if mime_type not in SUPPORTED_MIME_TYPES:
            logger.warning(f"Unsupported MIME type: {mime_type} — bỏ qua video {infor_id}")
            return

        logger.info(f"Bắt đầu xử lý video: infor_id={infor_id}, r2_path={r2_path}")

        # Dùng tempdir để tự động dọn dẹp file sau khi xong
        with tempfile.TemporaryDirectory() as tmpdir:
            video_ext  = self._mime_to_ext(mime_type)
            video_path = os.path.join(tmpdir, f"{infor_id}{video_ext}")
            audio_path = os.path.join(tmpdir, f"{infor_id}.wav")

            # Bước 1: Download video từ R2
            await self.s3_client.download_file(r2_path, video_path)
            logger.info(f"Downloaded video: {r2_path} → {video_path}")

            # Bước 2: Extract audio bằng ffmpeg
            self._extract_audio(video_path, audio_path)
            logger.info(f"Extracted audio: {audio_path}")

            # Bước 3: Whisper → chunks
            chunks = self.transcription.process_audio_file(
                audio_path=audio_path,
                video_id=infor_id,
                user_owner=user_owner,
                created_at=int(time.time()),
            )

            if chunks is None:
                logger.info(
                    f"Video {infor_id} không có lời nói rõ ràng "
                    f"→ fallback caption (chưa implement, bỏ qua)"
                )
                return

            # Bước 4: Embed từng chunk bằng e5-large
            texts   = [chunk["text"] for chunk in chunks]
            vectors = await self._embed_chunks(texts)

            # Bước 5: Upsert vào Qdrant
            await self.chunk_qdrant.upsert_chunks(chunks, vectors)

            logger.info(
                f"Hoàn thành xử lý video {infor_id}: "
                f"{len(chunks)} chunk đã được index vào Qdrant"
            )

    # ─────────────────────────────────────────────
    # Helper methods
    # ─────────────────────────────────────────────

    def _extract_audio(self, video_path: str, audio_path: str) -> None:
        """
        Dùng ffmpeg extract audio từ video, convert về 16kHz mono WAV
        (đúng format Whisper yêu cầu).
        """
        import subprocess
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", video_path,
                "-ar", "16000",   # 16kHz — Whisper yêu cầu
                "-ac", "1",       # mono
                "-vn",            # bỏ video stream
                audio_path,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr}")

    async def _embed_chunks(self, texts: list[str]) -> list[list[float]]:
        return [await self.embedding.embed_dense(text) for text in texts]

    def _mime_to_ext(self, mime_type: str) -> str:
        mapping = {
            "video/mp4":          ".mp4",
            "video/x-matroska":   ".mkv",
            "video/webm":         ".webm",
            "video/quicktime":    ".mov",
            "video/x-msvideo":    ".avi",
        }
        return mapping.get(mime_type, ".mp4")