# workers/asr/src/asr_worker/test_protocol.py

"""ASR 协议测试"""

import pytest
from .protocol import (
    AudioMessage,
    ResultMessage,
    ErrorMessage,
    StatusMessage,
    MessageType,
    serialize_message,
    deserialize_message,
)


class TestSerializeMessage:
    """测试消息序列化"""

    def test_serialize_audio_message(self):
        message = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64encodeddata",
            sample_rate=16000,
            channels=1,
        )
        result = serialize_message(message)

        assert '"type": "audio"' in result
        assert '"session_id": "session-001"' in result
        assert '"sequence": 1' in result

    def test_serialize_result_message(self):
        message = ResultMessage(
            session_id="session-001",
            sequence=1,
            text="Hello",
            confidence=0.95,
            start_ms=0,
            end_ms=1000,
            is_final=True,
        )
        result = serialize_message(message)

        assert '"type": "result"' in result
        assert '"text": "Hello"' in result
        assert '"is_final": true' in result

    def test_serialize_error_message(self):
        message = ErrorMessage(
            session_id="session-001",
            error_code="INVALID_AUDIO",
            error_message="Invalid audio format",
        )
        result = serialize_message(message)

        assert '"type": "error"' in result
        assert '"error_code": "INVALID_AUDIO"' in result

    def test_serialize_status_message(self):
        message = StatusMessage(
            session_id="session-001",
            status="ready",
            message="Worker is ready",
        )
        result = serialize_message(message)

        assert '"type": "status"' in result
        assert '"status": "ready"' in result
        assert '"message": "Worker is ready"' in result


class TestDeserializeMessage:
    """测试消息反序列化"""

    def test_deserialize_audio_message(self):
        json_str = '{"type": "audio", "session_id": "session-001", "sequence": 1, "audio_data": "base64data", "sample_rate": 16000, "channels": 1}'
        message = deserialize_message(json_str)

        assert isinstance(message, AudioMessage)
        assert message.session_id == "session-001"
        assert message.sequence == 1
        assert message.audio_data == "base64data"

    def test_deserialize_result_message(self):
        json_str = '{"type": "result", "session_id": "session-001", "sequence": 1, "text": "Hello", "confidence": 0.95, "start_ms": 0, "end_ms": 1000, "is_final": true}'
        message = deserialize_message(json_str)

        assert isinstance(message, ResultMessage)
        assert message.text == "Hello"
        assert message.is_final is True

    def test_deserialize_error_message(self):
        json_str = '{"type": "error", "session_id": "session-001", "error_code": "INVALID_AUDIO", "error_message": "Invalid audio format"}'
        message = deserialize_message(json_str)

        assert isinstance(message, ErrorMessage)
        assert message.error_code == "INVALID_AUDIO"

    def test_deserialize_status_message(self):
        json_str = '{"type": "status", "session_id": "session-001", "status": "ready", "message": "Worker is ready"}'
        message = deserialize_message(json_str)

        assert isinstance(message, StatusMessage)
        assert message.status == "ready"
        assert message.message == "Worker is ready"

    def test_deserialize_invalid_json(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            deserialize_message("invalid json")

    def test_deserialize_missing_type(self):
        json_str = '{"session_id": "session-001"}'
        with pytest.raises(ValueError, match="Missing 'type' field"):
            deserialize_message(json_str)

    def test_deserialize_unknown_type(self):
        json_str = '{"type": "unknown", "session_id": "session-001"}'
        with pytest.raises(ValueError, match="Unknown message type"):
            deserialize_message(json_str)


class TestRoundTrip:
    """测试序列化/反序列化往返"""

    def test_audio_message_roundtrip(self):
        original = AudioMessage(
            session_id="session-001",
            sequence=1,
            audio_data="base64data",
            sample_rate=16000,
            channels=1,
        )
        serialized = serialize_message(original)
        deserialized = deserialize_message(serialized)

        assert isinstance(deserialized, AudioMessage)
        assert deserialized.session_id == original.session_id
        assert deserialized.sequence == original.sequence
        assert deserialized.audio_data == original.audio_data

    def test_result_message_roundtrip(self):
        original = ResultMessage(
            session_id="session-001",
            sequence=1,
            text="Hello",
            confidence=0.95,
            start_ms=0,
            end_ms=1000,
            is_final=True,
        )
        serialized = serialize_message(original)
        deserialized = deserialize_message(serialized)

        assert isinstance(deserialized, ResultMessage)
        assert deserialized.text == original.text
        assert deserialized.is_final == original.is_final
