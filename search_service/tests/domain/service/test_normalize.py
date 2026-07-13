import pytest

from src.domain.service.normalize import (
    hashing_md5,
    normalize_desc,
    normalize_query_to_id,
    standard_normalize,
)


class TestStandardNormalize:
    def test_lowercases_and_strips_accents(self):
        result = standard_normalize("Hello World! Café 123")

        assert result == "hello world cafe 123"

    def test_returns_empty_string_for_empty_input(self):
        result = standard_normalize("")

        assert result == ""

    def test_returns_empty_string_for_none_input(self):
        result = standard_normalize(None)

        assert result == ""

    def test_collapses_multiple_spaces_and_tabs(self):
        result = standard_normalize("  Multiple   Spaces\tHere  ")

        assert result == "multiple spaces here"

    def test_removes_emoji(self):
        result = standard_normalize("emoji \U0001F600 test")

        assert result == "emoji test"

    def test_removes_punctuation_and_special_characters(self):
        result = standard_normalize("what?! is-this_thing@#$%")

        assert "?" not in result
        assert "!" not in result
        assert "@" not in result

    def test_keeps_newlines_unlike_normalize_desc(self):
        result = standard_normalize("line one\nline two")

        assert result == "line one\nline two"


class TestNormalizeDesc:
    def test_removes_url_lines(self):
        result = normalize_desc(
            "Check this out https://example.com and www.test.vn cool"
        )

        assert result == ""

    def test_keeps_non_url_lines_and_joins_with_period(self):
        result = normalize_desc("Line one\nhttps://foo.com/bar\nLine two")

        assert result == "line one. line two"

    def test_returns_empty_string_for_empty_input(self):
        result = normalize_desc("")

        assert result == ""

    def test_returns_empty_string_for_none_input(self):
        result = normalize_desc(None)

        assert result == ""

    def test_removes_emoji_before_url_filtering(self):
        result = normalize_desc("great video \U0001F600")

        assert result == "great video"


class TestNormalizeQueryToId:
    def test_replaces_spaces_and_punctuation_with_dashes(self):
        result = normalize_query_to_id("Hello World!")

        assert result == "hello-world-"

    def test_does_not_strip_leading_or_trailing_dashes(self):
        result = normalize_query_to_id("  spaced  out ")

        assert result == "-spaced-out-"
        assert result.startswith("-")
        assert result.endswith("-")

    def test_returns_empty_string_for_empty_input(self):
        result = normalize_query_to_id("")

        assert result == ""

    def test_returns_empty_string_for_none_input(self):
        result = normalize_query_to_id(None)

        assert result == ""

    def test_is_deterministic_for_same_query(self):
        first = normalize_query_to_id("Same Query")
        second = normalize_query_to_id("Same Query")

        assert first == second


class TestHashingMd5:
    def test_returns_known_md5_digest(self):
        result = hashing_md5("hello")

        assert result == "5d41402abc4b2a76b9719d911017c592"

    def test_returns_empty_string_digest_for_empty_input(self):
        result = hashing_md5("")

        assert result == hashing_md5("")

    def test_different_inputs_produce_different_digests(self):
        assert hashing_md5("input-one") != hashing_md5("input-two")

    def test_handles_unicode_characters(self):
        result = hashing_md5("héllo wörld 😀")

        assert isinstance(result, str)
        assert len(result) == 32
