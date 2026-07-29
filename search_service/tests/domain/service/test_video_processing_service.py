from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.domain.service.video_processing_service import VideoProcessingService


@pytest.fixture
def transcription():
    mock = MagicMock()
    mock.process_audio_file = MagicMock(return_value=None)
    return mock


@pytest.fixture
def embedding():
    mock = MagicMock()
    mock.embed_dense = AsyncMock(return_value=[0.1] * 1024)
    return mock


@pytest.fixture
def chunk_qdrant():
    mock = MagicMock()
    mock.upsert_chunks = AsyncMock()
    return mock


@pytest.fixture
def s3_client():
    mock = MagicMock()
    mock.download_file = AsyncMock()
    return mock


@pytest.fixture
def caption():
    return MagicMock()


@pytest.fixture
def service(transcription, embedding, chunk_qdrant, s3_client, caption, mocker):
    instance = VideoProcessingService(
        transcription=transcription,
        embedding=embedding,
        chunk_qdrant=chunk_qdrant,
        s3_client=s3_client,
        caption=caption,
    )
    mocker.patch.object(instance, "_extract_audio")
    return instance


class TestProcess:
    async def test_skips_unsupported_mime_type(self, service, s3_client):
        await service.process(
            infor_id="v1",
            processing_id="p1",
            r2_path="videos/v1.xyz",
            mime_type="application/pdf",
            user_owner="u1",
        )

        s3_client.download_file.assert_not_awaited()

    async def test_downloads_video_from_r2(self, service, s3_client, transcription):
        transcription.process_audio_file.return_value = [
            {"text": "hello", "start": 0, "end": 25}
        ]

        await service.process(
            infor_id="v1",
            processing_id="p1",
            r2_path="videos/v1.mp4",
            mime_type="video/mp4",
            user_owner="u1",
        )

        s3_client.download_file.assert_awaited_once()
        assert s3_client.download_file.await_args.args[0] == "videos/v1.mp4"

    async def test_upserts_chunks_with_embedded_vectors_on_happy_path(
        self, service, chunk_qdrant, transcription, embedding
    ):
        chunks = [{"text": "hello world", "start": 0, "end": 25}]
        transcription.process_audio_file.return_value = chunks

        await service.process(
            infor_id="v1",
            processing_id="p1",
            r2_path="videos/v1.mp4",
            mime_type="video/mp4",
            user_owner="u1",
        )

        embedding.embed_dense.assert_awaited_once_with("hello world")
        chunk_qdrant.upsert_chunks.assert_awaited_once()
        upserted_chunks, upserted_vectors = chunk_qdrant.upsert_chunks.await_args.args
        assert upserted_chunks == chunks
        assert upserted_vectors == [[0.1] * 1024]

    async def test_tags_chunks_with_provided_visibility(
        self, service, chunk_qdrant, transcription
    ):
        transcription.process_audio_file.return_value = [
            {"text": "hello", "start": 0, "end": 25}
        ]

        await service.process(
            infor_id="v1",
            processing_id="p1",
            r2_path="videos/v1.mp4",
            mime_type="video/mp4",
            user_owner="u1",
            visibility="PUBLIC",
        )

        upserted_chunks = chunk_qdrant.upsert_chunks.await_args.args[0]
        assert upserted_chunks[0]["visibility"] == "PUBLIC"

    async def test_falls_back_to_caption_chunks_when_audio_extraction_fails(
        self, service, chunk_qdrant, transcription, mocker
    ):
        service._extract_audio.side_effect = RuntimeError("no audio track")
        caption_chunks = [
            {"text": "a scene", "start": 0, "end": 25, "video_id": "v1", "user_owner": "u1", "source": "caption", "created_at": 1000}
        ]
        generate_caption_chunks = mocker.patch.object(
            service, "_generate_caption_chunks", new=AsyncMock(return_value=caption_chunks)
        )

        await service.process(
            infor_id="v1",
            processing_id="p1",
            r2_path="videos/v1.mp4",
            mime_type="video/mp4",
            user_owner="u1",
        )

        generate_caption_chunks.assert_awaited_once()
        transcription.process_audio_file.assert_not_called()
        chunk_qdrant.upsert_chunks.assert_awaited_once()

    async def test_falls_back_to_caption_chunks_when_no_speech_detected(
        self, service, chunk_qdrant, transcription, mocker
    ):
        transcription.process_audio_file.return_value = None
        caption_chunks = [
            {"text": "a scene", "start": 0, "end": 25, "video_id": "v1", "user_owner": "u1", "source": "caption", "created_at": 1000}
        ]
        mocker.patch.object(
            service, "_generate_caption_chunks", new=AsyncMock(return_value=caption_chunks)
        )

        await service.process(
            infor_id="v1",
            processing_id="p1",
            r2_path="videos/v1.mp4",
            mime_type="video/mp4",
            user_owner="u1",
        )

        chunk_qdrant.upsert_chunks.assert_awaited_once()

    async def test_skips_indexing_when_no_audio_and_no_caption_chunks(
        self, service, chunk_qdrant, transcription, mocker
    ):
        transcription.process_audio_file.return_value = None
        mocker.patch.object(
            service, "_generate_caption_chunks", new=AsyncMock(return_value=[])
        )

        await service.process(
            infor_id="v1",
            processing_id="p1",
            r2_path="videos/v1.mp4",
            mime_type="video/mp4",
            user_owner="u1",
        )

        chunk_qdrant.upsert_chunks.assert_not_awaited()


class TestGetVideoDuration:
    def test_returns_duration_parsed_from_ffprobe_stdout(self, service, mocker):
        mocker.patch(
            "subprocess.run",
            return_value=MagicMock(returncode=0, stdout="123.45\n"),
        )

        result = service._get_video_duration("video.mp4")

        assert result == 123.45

    def test_raises_runtime_error_when_ffprobe_fails(self, service, mocker):
        mocker.patch(
            "subprocess.run",
            return_value=MagicMock(returncode=1, stderr="no such file"),
        )

        with pytest.raises(RuntimeError, match="ffprobe failed"):
            service._get_video_duration("video.mp4")


class TestExtractFrames:
    def test_extracts_one_frame_per_window_and_touches_files(
        self, service, mocker, tmp_path
    ):
        def fake_run(cmd, capture_output, text):
            frame_path = cmd[-1]
            Path(frame_path).touch()
            return MagicMock(returncode=0, stderr="")

        mocker.patch("subprocess.run", side_effect=fake_run)

        frames = service._extract_frames(
            "video.mp4", str(tmp_path), duration=60.0
        )

        assert len(frames) == 3
        assert frames[0]["start"] == 0.0
        assert frames[0]["end"] == 25.0
        assert frames[1]["start"] == 25.0
        assert frames[2]["end"] == 60.0

    def test_skips_frame_when_ffmpeg_fails(self, service, mocker, tmp_path):
        mocker.patch(
            "subprocess.run",
            return_value=MagicMock(returncode=1, stderr="boom"),
        )

        frames = service._extract_frames("video.mp4", str(tmp_path), duration=25.0)

        assert frames == []


class TestGenerateCaptionChunks:
    async def test_returns_empty_list_when_no_frames_extracted(
        self, service, mocker
    ):
        mocker.patch.object(service, "_get_video_duration", return_value=25.0)
        mocker.patch.object(service, "_extract_frames", return_value=[])

        result = await service._generate_caption_chunks(
            video_path="video.mp4", tmpdir="/tmp/x", video_id="v1", user_owner="u1"
        )

        assert result == []

    async def test_builds_chunks_from_generated_captions(
        self, service, mocker, caption
    ):
        mocker.patch.object(service, "_get_video_duration", return_value=25.0)
        mocker.patch.object(
            service,
            "_extract_frames",
            return_value=[{"frame_path": "frame_0.jpg", "start": 0.0, "end": 25.0}],
        )
        caption.generate_caption = MagicMock(return_value="a person talking")

        result = await service._generate_caption_chunks(
            video_path="video.mp4", tmpdir="/tmp/x", video_id="v1", user_owner="u1"
        )

        assert len(result) == 1
        assert result[0]["text"] == "a person talking"
        assert result[0]["video_id"] == "v1"
        assert result[0]["user_owner"] == "u1"
        assert result[0]["source"] == "caption"

    async def test_skips_frame_when_caption_generation_raises(
        self, service, mocker, caption
    ):
        mocker.patch.object(service, "_get_video_duration", return_value=25.0)
        mocker.patch.object(
            service,
            "_extract_frames",
            return_value=[{"frame_path": "frame_0.jpg", "start": 0.0, "end": 25.0}],
        )
        caption.generate_caption = MagicMock(side_effect=RuntimeError("model error"))

        result = await service._generate_caption_chunks(
            video_path="video.mp4", tmpdir="/tmp/x", video_id="v1", user_owner="u1"
        )

        assert result == []


class TestMimeToExt:
    @pytest.mark.parametrize(
        "mime_type,expected_ext",
        [
            ("video/mp4", ".mp4"),
            ("video/x-matroska", ".mkv"),
            ("video/webm", ".webm"),
            ("video/quicktime", ".mov"),
            ("video/x-msvideo", ".avi"),
            ("video/unknown", ".mp4"),
        ],
    )
    def test_maps_mime_type_to_extension(self, service, mime_type, expected_ext):
        assert service._mime_to_ext(mime_type) == expected_ext
