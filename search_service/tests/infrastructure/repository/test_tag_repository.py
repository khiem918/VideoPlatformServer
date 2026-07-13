from tests.conftest import install_container_stub

install_container_stub()

from src.infrastructure.repository.tag_repository import upsert_tag  # noqa: E402


class TestUpsertTag:
    def test_currently_a_no_op_stub(self):
        result = upsert_tag("some-tag")

        assert result is None
