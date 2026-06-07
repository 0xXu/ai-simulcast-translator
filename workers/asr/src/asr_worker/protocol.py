# workers/asr/src/asr_worker/protocol.py

"""ASR Worker 协议定义"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional
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
    detected_language: Optional[str] = None
    language_probability: Optional[float] = None


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


def _required(data: dict[str, Any], field: str) -> Any:
    if field not in data:
        raise ValueError(f"Missing required field: {field}")
    return data[field]


def _string(data: dict[str, Any], field: str) -> str:
    value = _required(data, field)
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    return value


def _integer(data: dict[str, Any], field: str) -> int:
    value = _required(data, field)
    if type(value) is not int:
        raise ValueError(f"{field} must be an integer")
    return value


def _number(data: dict[str, Any], field: str) -> float:
    value = _required(data, field)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a number")
    return float(value)


def _boolean(data: dict[str, Any], field: str) -> bool:
    value = _required(data, field)
    if not isinstance(value, bool):
        raise ValueError(f"{field} must be a boolean")
    return value


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
        if message.detected_language is not None:
            data["detected_language"] = message.detected_language
        if message.language_probability is not None:
            data["language_probability"] = message.language_probability
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

    if not isinstance(data, dict):
        raise ValueError("JSON message must be an object")

    message_type = data.get("type")
    if not message_type:
        raise ValueError("Missing 'type' field")
    if not isinstance(message_type, str):
        raise ValueError("type must be a string")

    try:
        msg_type = MessageType(message_type)
    except ValueError as error:
        raise ValueError(f"Unknown message type: {message_type}") from error

    if msg_type == MessageType.AUDIO:
        sample_rate = data.get("sample_rate", 16000)
        channels = data.get("channels", 1)
        if type(sample_rate) is not int or sample_rate != 16000:
            raise ValueError("sample_rate must be 16000")
        if type(channels) is not int or channels != 1:
            raise ValueError("channels must be 1")

        return AudioMessage(
            session_id=_string(data, "session_id"),
            sequence=_integer(data, "sequence"),
            audio_data=_string(data, "audio_data"),
            sample_rate=sample_rate,
            channels=channels,
        )
    elif msg_type == MessageType.RESULT:
        detected_language = data.get("detected_language")
        if detected_language is not None and not isinstance(detected_language, str):
            raise ValueError("detected_language must be a string")
        language_probability = data.get("language_probability")
        if (
            language_probability is not None
            and (
                isinstance(language_probability, bool)
                or not isinstance(language_probability, (int, float))
            )
        ):
            raise ValueError("language_probability must be a number")
        return ResultMessage(
            session_id=_string(data, "session_id"),
            sequence=_integer(data, "sequence"),
            text=_string(data, "text"),
            confidence=_number(data, "confidence"),
            start_ms=_integer(data, "start_ms"),
            end_ms=_integer(data, "end_ms"),
            is_final=_boolean(data, "is_final"),
            detected_language=detected_language,
            language_probability=(
                float(language_probability)
                if language_probability is not None
                else None
            ),
        )
    elif msg_type == MessageType.ERROR:
        return ErrorMessage(
            session_id=_string(data, "session_id"),
            error_code=_string(data, "error_code"),
            error_message=_string(data, "error_message"),
        )
    elif msg_type == MessageType.STATUS:
        message = data.get("message")
        if message is not None and not isinstance(message, str):
            raise ValueError("message must be a string")

        return StatusMessage(
            session_id=_string(data, "session_id"),
            status=_string(data, "status"),
            message=message,
        )
    else:
        raise ValueError(f"Unhandled message type: {msg_type}")
