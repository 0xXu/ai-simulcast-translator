from typing import Optional, Protocol, runtime_checkable

from .protocol import AudioMessage, ResultMessage


@runtime_checkable
class AsrEngine(Protocol):
    def process_audio(
        self,
        audio_message: AudioMessage,
    ) -> Optional[ResultMessage]:
        ...

    def reset(self) -> None:
        ...
