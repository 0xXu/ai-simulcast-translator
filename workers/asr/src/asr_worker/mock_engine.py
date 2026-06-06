# workers/asr/src/asr_worker/mock_engine.py

"""Mock ASR 引擎 - 用于测试和开发"""

from typing import Optional
from .protocol import AudioMessage, ResultMessage


class MockAsrEngine:
    """确定性 Mock ASR 引擎"""

    def __init__(self):
        self.processed_count = 0

    def process_audio(self, audio_message: AudioMessage) -> Optional[ResultMessage]:
        """处理音频数据，返回识别结果"""
        self.processed_count += 1

        # 模拟识别结果
        return ResultMessage(
            session_id=audio_message.session_id,
            sequence=audio_message.sequence,
            text=f"Mock result {self.processed_count}",
            confidence=0.95,
            start_ms=0,
            end_ms=1000,
            is_final=True,
        )

    def reset(self):
        """重置引擎状态"""
        self.processed_count = 0
