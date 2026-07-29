import pytest

from src.domain.service.transcription_service import TranscriptionService


class FakeSegment:
    def __init__(self, start, end, text, no_speech_prob=0.0):
        self.start = start
        self.end = end
        self.text = text
        self.no_speech_prob = no_speech_prob


class TestLoadModel:
    def test_loads_whisper_model_with_configured_size(self, mocker):
        whisper_cls = mocker.patch(
            "src.domain.service.transcription_service.WhisperModel"
        )

        service = TranscriptionService()
        service.load_model()

        whisper_cls.assert_called_once()
        assert service._model is whisper_cls.return_value

    def test_does_not_reload_model_when_already_loaded(self, mocker):
        whisper_cls = mocker.patch(
            "src.domain.service.transcription_service.WhisperModel"
        )

        service = TranscriptionService()
        service.load_model()
        service.load_model()

        whisper_cls.assert_called_once()


class TestTranscribe:
    def test_raises_runtime_error_when_model_not_loaded(self):
        service = TranscriptionService()

        with pytest.raises(RuntimeError, match="chưa được load"):
            service.transcribe("audio.wav")

    def test_returns_list_of_segments_from_model(self):
        service = TranscriptionService()
        info = type("Info", (), {"language": "vi", "language_probability": 0.9})()
        segments = [FakeSegment(0, 5, "hello")]
        service._model = type(
            "FakeModel",
            (),
            {"transcribe": lambda self, path, language=None: (segments, info)},
        )()

        result = service.transcribe("audio.wav")

        assert result == segments


class TestMergeSegmentsToChunks:
    def test_returns_empty_list_for_no_segments(self):
        service = TranscriptionService()

        result = service.merge_segments_to_chunks([], window_seconds=25)

        assert result == []

    def test_merges_segments_into_single_chunk_once_window_reached(self):
        service = TranscriptionService()
        segments = [
            FakeSegment(0, 10, "hello", 0.1),
            FakeSegment(10, 26, "world", 0.2),
        ]

        result = service.merge_segments_to_chunks(segments, window_seconds=25)

        assert len(result) == 1
        assert result[0]["text"] == "hello world"
        assert result[0]["start"] == 0
        assert result[0]["end"] == 26
        assert result[0]["no_speech_prob_avg"] == pytest.approx(0.15)

    def test_appends_trailing_remainder_below_window_as_final_chunk(self):
        service = TranscriptionService()
        segments = [FakeSegment(0, 5, "short", 0.3)]

        result = service.merge_segments_to_chunks(segments, window_seconds=25)

        assert len(result) == 1
        assert result[0]["text"] == "short"
        assert result[0]["end"] == 5

    def test_starts_new_chunk_after_window_boundary_is_crossed(self):
        service = TranscriptionService()
        segments = [
            FakeSegment(0, 25, "first chunk", 0.1),
            FakeSegment(25, 30, "second chunk", 0.2),
        ]

        result = service.merge_segments_to_chunks(segments, window_seconds=25)

        assert len(result) == 2
        assert result[0]["text"] == "first chunk"
        assert result[1]["text"] == "second chunk"


class TestProcessAudioTranscript:
    def test_returns_none_when_no_segments_detected(self):
        service = TranscriptionService()

        result = service.process_audio_transcript([])

        assert result is None

    def test_returns_chunks_when_segments_present(self, mocker):
        service = TranscriptionService()
        fake_chunks = [{"text": "hi", "start": 0, "end": 5, "no_speech_prob_avg": 0.1}]
        mocker.patch.object(service, "merge_segments_to_chunks", return_value=fake_chunks)

        result = service.process_audio_transcript([FakeSegment(0, 5, "hi")])

        assert result == fake_chunks


class TestProcessAudioFile:
    def test_returns_none_when_transcript_has_no_speech(self, mocker):
        service = TranscriptionService()
        mocker.patch.object(service, "transcribe", return_value=[])
        mocker.patch.object(service, "process_audio_transcript", return_value=None)

        result = service.process_audio_file(
            "audio.wav", video_id="v1", user_owner="u1", created_at=1000
        )

        assert result is None

    def test_filters_out_chunks_with_high_no_speech_probability(self, mocker):
        service = TranscriptionService()
        mocker.patch.object(service, "transcribe", return_value=[])
        chunks = [
            {"text": "noise", "start": 0, "end": 25, "no_speech_prob_avg": 0.9},
            {"text": "speech", "start": 25, "end": 50, "no_speech_prob_avg": 0.1},
        ]
        mocker.patch.object(service, "process_audio_transcript", return_value=chunks)

        result = service.process_audio_file(
            "audio.wav", video_id="v1", user_owner="u1", created_at=1000
        )

        assert len(result) == 1
        assert result[0]["text"] == "speech"

    def test_returns_none_when_all_chunks_filtered_out(self, mocker):
        service = TranscriptionService()
        mocker.patch.object(service, "transcribe", return_value=[])
        chunks = [{"text": "noise", "start": 0, "end": 25, "no_speech_prob_avg": 0.9}]
        mocker.patch.object(service, "process_audio_transcript", return_value=chunks)

        result = service.process_audio_file(
            "audio.wav", video_id="v1", user_owner="u1", created_at=1000
        )

        assert result is None

    def test_attaches_video_metadata_to_valid_chunks(self, mocker):
        service = TranscriptionService()
        mocker.patch.object(service, "transcribe", return_value=[])
        chunks = [{"text": "speech", "start": 0, "end": 25, "no_speech_prob_avg": 0.1}]
        mocker.patch.object(service, "process_audio_transcript", return_value=chunks)

        result = service.process_audio_file(
            "audio.wav", video_id="v1", user_owner="u1", created_at=1000
        )

        assert result[0]["video_id"] == "v1"
        assert result[0]["user_owner"] == "u1"
        assert result[0]["source"] == "audio"
        assert result[0]["created_at"] == 1000
