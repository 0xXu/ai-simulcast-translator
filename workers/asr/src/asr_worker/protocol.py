# workers/asr/src/asr_worker/protocol.py

"""ASR Worker 协议定义"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional
import json


class MessageType(str, Enum):
    """消息类型"""
    AUDIO = "audio"
    RESULT = "result"
    ERROR = "error"
    STATUS = "status"


@dataclass
class AudioMessage:
    """音频消息"""
    session_id: str
    sequence: int
    audio_data: str  # base64 编码的 PCM 数据
    sample_rate: int = 16000
    channels: int = 1


@dataclass
class ResultMessage:
    """识别结果消息"""
    session_id: str
    sequence: int
    text: str
    confidence: float
    start_ms: int
    end_ms: int
    is_final: bool


@dataclass
class ErrorMessage:
    """错误消息"""
    session_id: str
    error_code: str
    error_message: str


@dataclass
class StatusMessage:
    """状态消息"""
    session_id: str
    status: str
    message: Optional[str] = None


def serialize_message(message: AudioMessage | ResultMessage | ErrorMessage | StatusMessage) -> str:
    """序列化消息为 JSON 字符串"""
    if isinstance(message, AudioMessage):
        data = {
            "type": MessageType.AUDIO.value,
            "session_id": message.session_id,
            "sequence": message.sequence,
            "audio_data": message.audio_data,
            "sample_rate": message.sample_rate,
            "channels": message.channels,
        }
    elif isinstance(message, ResultMessage):
        data = {
            "type": MessageType.RESULT.value,
            "session_id": message.session_id,
            "sequence": message.sequence,
            "text": message.text,
            "confidence": message.confidence,
            "start_ms": message.start_ms,
            "end_ms": message.end_ms,
            "is_final": message.is_final,
        }
    elif isinstance(message, ErrorMessage):
        data = {
            "type": MessageType.ERROR.value,
            "session_id": message.session_id,
            "error_code": message.error_code,
            "error_message": message.error_message,
        }
    elif isinstance(message, StatusMessage):
        data = {
            "type": MessageType.STATUS.value,
            "session_id": message.session_id,
            "status": message.status,
        }
        if message.message is not None:
            data["message"] = message.message
    else:
        raise ValueError(f"Unknown message type: {type(message)}")

    return json.dumps(data, ensure_ascii=False)


def deserialize_message(json_str: str) -> AudioMessage | ResultMessage | ErrorMessage | StatusMessage:
    """从 JSON 字符串反序列化消息"""
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}")

    message_type = data.get("type")
    if not message_type:
        raise ValueError("Missing 'type' field")

    try:
        msg_type = MessageType(message_type)
    except ValueError:
        raise ValueError(f"Unknown message type: {message_type}")

    if msg_type == MessageType.AUDIO:
        return AudioMessage(
            session_id=data["session_id"],
            sequence=data["sequence"],
            audio_data=data["audio_data"],
            sample_rate=data.get("sample_rate", 16000),
            channels=data.get("channels", 1),
        )
    elif msg_type == MessageType.RESULT:
        return ResultMessage(
            session_id=data["session_id"],
            sequence=data["sequence"],
            text=data["text"],
            confidence=data["confidence"],
            start_ms=data["start_ms"],
            end_ms=data["end_ms"],
            is_final=data["is_final"],
        )
    elif msg_type == MessageType.ERROR:
        return ErrorMessage(
            session_id=data["session_id"],
            error_code=data["error_code"],
            error_message=data["error_message"],
        )
    elif msg_type == MessageType.STATUS:
        return StatusMessage(
            session_id=data["session_id"],
            status=data["status"],
            message=data.get("message"),
        )
    else:
        raise ValueError(f"Unhandled message type: {msg_type}")
