import importlib
import sys

import pytest


class TestContainerConstructionBug:
    def test_bug_module_level_singleton_instantiation_raises_attribute_error(self):
        saved = sys.modules.pop("src.app.container", None)
        try:
            with pytest.raises(AttributeError, match="GRPC_SERVER_URL"):
                importlib.import_module("src.app.container")
        finally:
            if saved is not None:
                sys.modules["src.app.container"] = saved
            else:
                sys.modules.pop("src.app.container", None)
