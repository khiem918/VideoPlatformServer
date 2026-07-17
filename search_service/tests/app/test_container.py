import importlib
import sys


class TestContainerConstruction:
    def test_module_level_singleton_instantiates_without_error(self):
        saved = sys.modules.pop("src.app.container", None)
        try:
            importlib.import_module("src.app.container")
        finally:
            if saved is not None:
                sys.modules["src.app.container"] = saved
            else:
                sys.modules.pop("src.app.container", None)
