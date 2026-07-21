"""Type hints for the Decky backend runtime injected into plugins."""

from typing import Any, Callable, Coroutine

DECKY_PLUGIN_DIR: str
DECKY_PLUGIN_NAME: str
DECKY_PLUGIN_RUNTIME_DIR: str
DECKY_PLUGIN_SETTINGS_DIR: str
DECKY_PLUGIN_LOG_DIR: str
DECKY_HOME: str
DECKY_USER_HOME: str

class logger:
    @staticmethod
    def info(*args: Any, **kwargs: Any) -> None: ...
    @staticmethod
    def error(*args: Any, **kwargs: Any) -> None: ...
    @staticmethod
    def debug(*args: Any, **kwargs: Any) -> None: ...
    @staticmethod
    def warn(*args: Any, **kwargs: Any) -> None: ...

async def emit(event: str, *args: Any) -> None: ...
