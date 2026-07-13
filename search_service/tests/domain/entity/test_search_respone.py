import pytest
from pydantic import ValidationError

from src.domain.entity.search_respone import SearchResponse, SearchResponseList


VALID_ITEM = {
    "video_id": "video-1",
    "title": "Some Title",
    "description": "Some description",
    "thumbnail_url": "https://cdn.example.test/thumb.jpg",
    "view": 100,
    "date": 1700000000,
    "channel": "channel-1",
}


class TestSearchResponse:
    def test_accepts_valid_payload(self):
        model = SearchResponse(**VALID_ITEM)

        assert model.video_id == "video-1"
        assert model.channel == "channel-1"

    def test_rejects_missing_required_field(self):
        payload = dict(VALID_ITEM)
        payload.pop("title")

        with pytest.raises(ValidationError):
            SearchResponse(**payload)

    def test_rejects_non_integer_view(self):
        with pytest.raises(ValidationError):
            SearchResponse(**{**VALID_ITEM, "view": "not-a-number"})


class TestSearchResponseList:
    def test_defaults_cursor_to_none_when_not_provided(self):
        model = SearchResponseList(data=[SearchResponse(**VALID_ITEM)])

        assert model.cursor is None
        assert len(model.data) == 1

    def test_accepts_explicit_cursor_value(self):
        model = SearchResponseList(data=[], cursor=20)

        assert model.cursor == 20

    def test_accepts_empty_data_list(self):
        model = SearchResponseList(data=[])

        assert model.data == []

    def test_rejects_non_list_data(self):
        with pytest.raises(ValidationError):
            SearchResponseList(data="not-a-list")

    def test_rejects_invalid_item_in_data_list(self):
        with pytest.raises(ValidationError):
            SearchResponseList(data=[{"video_id": "only-one-field"}])
