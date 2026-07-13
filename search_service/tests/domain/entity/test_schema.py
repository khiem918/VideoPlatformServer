import pytest
from pydantic import ValidationError

from src.domain.entity.schema import MetaDataCache


VALID_PAYLOAD = {
    "video_id": "video-1",
    "title": "Some Title",
    "description": "Some description",
    "thumbnail_url": "videos/video-1/thumb.jpg",
    "view": 100,
    "date": 1700000000,
    "channel": 1,
    "visibility": "PUBLIC",
}


class TestMetaDataCache:
    def test_accepts_valid_payload(self):
        model = MetaDataCache(**VALID_PAYLOAD)

        assert model.video_id == "video-1"
        assert model.visibility == "PUBLIC"

    @pytest.mark.parametrize("visibility", ["DRAFT", "PUBLIC", "PRIVATE"])
    def test_accepts_each_allowed_visibility_value(self, visibility):
        model = MetaDataCache(**{**VALID_PAYLOAD, "visibility": visibility})

        assert model.visibility == visibility

    def test_rejects_invalid_visibility_value(self):
        with pytest.raises(ValidationError):
            MetaDataCache(**{**VALID_PAYLOAD, "visibility": "ARCHIVED"})

    def test_rejects_missing_required_field(self):
        payload = dict(VALID_PAYLOAD)
        payload.pop("video_id")

        with pytest.raises(ValidationError):
            MetaDataCache(**payload)

    def test_rejects_non_integer_view(self):
        with pytest.raises(ValidationError):
            MetaDataCache(**{**VALID_PAYLOAD, "view": "not-a-number"})

    def test_coerces_numeric_string_view_to_int(self):
        model = MetaDataCache(**{**VALID_PAYLOAD, "view": "250"})

        assert model.view == 250
        assert isinstance(model.view, int)

    def test_rejects_non_string_thumbnail_url(self):
        with pytest.raises(ValidationError):
            MetaDataCache(**{**VALID_PAYLOAD, "thumbnail_url": None})
