# workers/asr/src/asr_worker/main.py

"""ASR Worker 主入口"""

import argparse
import sys
from typing import TextIO

from .protocol import (
    AudioMessage,
    ResultMessage,
    ErrorMessage,
    StatusMessage,
    serialize_message,
    deserialize_message,
)
from .mock_engine import MockAsrEngine


class AsrWorker:
    """ASR Worker 主类"""

    def __init__(
        self,
        input_stream: TextIO,
        output_stream: TextIO,
        engine: "AsrEngine | None" = None,
    ) -> None:
        self.input_stream = input_stream
        self.output_stream = output_stream
        self.engine = engine or MockAsrEngine()
        self.running = False

    def run(self):
        """运行 Worker"""
        self.running = True

        # 发送就绪状态
        self._send_status("ready", "ASR Worker is ready")

        while self.running:
            try:
                line = self.input_stream.readline()
                if not line:
                    break

                line = line.strip()
                if not line:
                    continue

                self._process_message(line)
            except Exception as e:
                self._send_error("UNKNOWN", str(e))

    def stop(self):
        """停止 Worker"""
        self.running = False

    def _process_message(self, line: str):
        """处理输入消息"""
        try:
            message = deserialize_message(line)
        except ValueError as e:
            self._send_error("INVALID_MESSAGE", str(e))
            return

        if isinstance(message, AudioMessage):
            self._process_audio(message)
        else:
            self._send_error("UNSUPPORTED_TYPE", f"Unsupported message type: {type(message)}")

    def _process_audio(self, audio: AudioMessage):
        """处理音频数据"""
        try:
            result = self.engine.process_audio(audio)
            if result:
                self._send_result(result)
        except Exception as e:
            self._send_error(
                "PROCESSING_ERROR",
                str(e),
                session_id=audio.session_id,
            )

    def _send_result(self, result: ResultMessage):
        """发送识别结果"""
        self._send_message(serialize_message(result))

    def _send_error(self, error_code: str, error_message: str, session_id: str = ""):
        """发送错误消息"""
        error = ErrorMessage(
            session_id=session_id,
            error_code=error_code,
            error_message=error_message,
        )
        self._send_message(serialize_message(error))

    def _send_status(self, status: str, message: str = None, session_id: str = ""):
        """发送状态消息"""
        status_msg = StatusMessage(
            session_id=session_id,
            status=status,
            message=message,
        )
        self._send_message(serialize_message(status_msg))

    def _send_message(self, message: str):
        """发送消息到输出流"""
        self.output_stream.write(message + "\n")
        self.output_stream.flush()


def create_engine(name: str, **kwargs) -> "AsrEngine":
    """工厂函数：根据名称创建识别引擎实例"""
    if name == "mock":
        return MockAsrEngine()
    if name == "faster-whisper":
        from .faster_whisper_engine import FasterWhisperEngine, FasterWhisperConfig
        config = FasterWhisperConfig(
            model_name=kwargs.get("model_name", "small.en"),
            device=kwargs.get("device", "cpu"),
            compute_type=kwargs.get("compute_type", "int8"),
        )
        return FasterWhisperEngine(config=config)
    raise ValueError(f"unknown engine: {name}")


def main():
    """主入口"""
    parser = argparse.ArgumentParser(description="ASR Worker")
    parser.add_argument("--engine", choices=["mock", "faster-whisper"], default="mock")
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()

    engine = create_engine(
        args.engine,
        model_name=args.model,
        device=args.device,
        compute_type=args.compute_type,
    )
    worker = AsrWorker(sys.stdin, sys.stdout, engine=engine)
    worker.run()


if __name__ == "__main__":
    main()
