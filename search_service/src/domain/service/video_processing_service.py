import asyncio
import logging
import os
import tempfile
import time
from src.domain.service.transcription_service import TranscriptionService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService
from src.infrastructure.s3.s3_client import S3Client
from src.domain.service.caption_service import CaptionService
from src.domain.service.normalize import normalize_transcript_text

logger = logging.getLogger(__name__)

SUPPORTED_MIME_TYPES = {
    "video/mp4",
    "video/x-matroska",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
}
CAPTION_WINDOW_SECONDS = int(os.getenv("CAPTION_WINDOW_SECONDS", 25))

class VideoProcessingService:
    def __init__(
        self,
        transcription: TranscriptionService,
        embedding: EmbeddingService,
        chunk_qdrant: ChunkQdrantService,
        s3_client: S3Client,
        caption: CaptionService,
    ):
        self.transcription  = transcription
        self.embedding      = embedding
        self.chunk_qdrant   = chunk_qdrant
        self.s3_client             = s3_client
        self.caption               = caption

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
        visibility:    str = "DRAFT",
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
            audio_extracted = True
            try:
                await asyncio.to_thread(self._extract_audio, video_path, audio_path)
                logger.info(f"Extracted audio: {audio_path}")
            except RuntimeError as e:
                logger.info(f"Video {infor_id} không có audio track ({e}) → chuyển sang BLIP caption fallback")
                audio_extracted = False

            # Bước 3: Whisper → chunks
            chunks = None
            if audio_extracted:
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
                chunks = await self._generate_caption_chunks(
                    video_path=video_path,
                    tmpdir=tmpdir,
                    video_id=infor_id,
                    user_owner=user_owner,
                )
                
            if not chunks:
                logger.warning(
                    f"Video {infor_id} không có audio lẫn frame hợp lệ "
                    f"→ bỏ qua, không index được"
                )
                return

            for chunk in chunks:
                chunk["visibility"] = visibility
            
            # Bước 4: Embed từng chunk bằng e5-large (dense) + BM25 (sparse)
            # Chuẩn hóa text (bỏ emoji/dấu câu/khoảng trắng thừa, GIỮ dấu tiếng Việt)
            # trước khi embed để khớp đối xứng với query lúc search (search.py).
            # payload upsert_chunks() vẫn dùng chunk["text"] gốc để hiển thị cho người dùng.
            texts_for_embedding = [normalize_transcript_text(chunk["text"]) for chunk in chunks]
            vectors        = await self._embed_chunks(texts_for_embedding)

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

    def _extract_frames(self, video_path: str, output_dir: str, duration: float) -> list[dict]:
        """
        Trích frame từ video theo khoảng thời gian cố định (CAPTION_WINDOW_SECONDS).
        Mỗi frame lấy tại điểm giữa mỗi cửa sổ thời gian.

        Args:
            video_path: đường dẫn video local đã download
            output_dir: thư mục lưu frame ảnh
            duration:   tổng thời lượng video (giây), dùng để tính số frame cần lấy

        Returns:
            list[dict]: mỗi dict gồm { frame_path, start, end }
        """
        import subprocess

        os.makedirs(output_dir, exist_ok=True)

        frames = []
        start = 0.0

        while start < duration:
            end = min(start + CAPTION_WINDOW_SECONDS, duration)
            midpoint = (start + end) / 2

            frame_path = os.path.join(output_dir, f"frame_{len(frames)}.jpg")

            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", str(midpoint),
                    "-i", video_path,
                    "-vframes", "1",
                    "-q:v", "2",   # chất lượng JPEG cao (thang 2-31, càng thấp càng nét)
                    frame_path,
                ],
                capture_output=True,
                text=True,
            )

            if result.returncode == 0 and os.path.exists(frame_path):
                frames.append({
                    "frame_path": frame_path,
                    "start": start,
                    "end": end,
                })
            else:
                logger.warning(f"Không trích được frame tại {midpoint}s: {result.stderr}")

            start = end

        return frames
    
    def _get_video_duration(self, video_path: str) -> float:
        """
        Lấy thời lượng video (giây) bằng ffprobe.
        Cần thiết để tính số frame trích cho BLIP caption fallback.
        """
        import subprocess

        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path,
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {result.stderr}")

        return float(result.stdout.strip())
    
    async def _embed_chunks(self, texts: list[str]) -> list[list[float]]:
        return [await self.embedding.embed_dense(text) for text in texts]
    
    async def _generate_caption_chunks(
        self,
        video_path: str,
        tmpdir: str,
        video_id: str,
        user_owner: str,
    ) -> list[dict]:
        """
        Sinh chunk từ BLIP caption khi video không có lời nói rõ ràng.
        Format chunk giống hệt bên audio, chỉ khác source='caption'.
        """
        duration = self._get_video_duration(video_path)
        frames_dir = os.path.join(tmpdir, "frames")

        frames = self._extract_frames(video_path, frames_dir, duration)

        if not frames:
            logger.warning(f"Không trích được frame nào cho video {video_id}")
            return []

        chunks = []
        created_at = int(time.time())

        for frame in frames:
            try:
                caption = await asyncio.to_thread(self.caption.generate_caption, frame["frame_path"])
            except Exception as e:
                logger.warning(f"Lỗi sinh caption cho frame {frame['frame_path']}: {e}")
                continue

            chunks.append({
                "text":       caption.strip(),
                "start":      frame["start"],
                "end":        frame["end"],
                "video_id":   video_id,
                "user_owner": user_owner,
                "source":     "caption",
                "created_at": created_at,
            })

        logger.info(f"Video {video_id}: sinh được {len(chunks)}/{len(frames)} caption hợp lệ")
        return chunks

    def _mime_to_ext(self, mime_type: str) -> str:
        mapping = {
            "video/mp4":          ".mp4",
            "video/x-matroska":   ".mkv",
            "video/webm":         ".webm",
            "video/quicktime":    ".mov",
            "video/x-msvideo":    ".avi",
        }
        return mapping.get(mime_type, ".mp4")