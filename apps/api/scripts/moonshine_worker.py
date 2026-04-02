import contextlib
import json
import os
import struct
import sys
import tempfile
import wave
from pathlib import Path

try:
    import moonshine_onnx as moonshine
except ImportError:
    moonshine = None


def emit(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def create_silence_wav() -> str:
    sample_rate = 16000
    frame_count = sample_rate // 5
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    temp_file.close()

    with contextlib.closing(wave.open(temp_file.name, "wb")) as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        silence = struct.pack("<" + "h" * frame_count, *([0] * frame_count))
        wav_file.writeframes(silence)

    return temp_file.name


def warm_model(model_name: str) -> None:
    if moonshine is None:
        raise RuntimeError("moonshine_onnx is not installed.")

    silence_path = create_silence_wav()
    try:
        moonshine.transcribe(silence_path, model_name)
    finally:
        Path(silence_path).unlink(missing_ok=True)


def transcribe(audio_path: str, model_name: str) -> str:
    if moonshine is None:
        raise RuntimeError("moonshine_onnx is not installed.")

    result = moonshine.transcribe(audio_path, model_name)
    if isinstance(result, list):
        return " ".join(str(item).strip() for item in result if str(item).strip()).strip()
    return str(result).strip()


def main() -> int:
    model_name = os.environ.get("MOONSHINE_MODEL", "moonshine/base").strip() or "moonshine/base"
    warm_model(model_name)
    emit({"type": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request = None
        try:
            request = json.loads(line)
            request_id = request["id"]
            audio_path = str(request["audio_path"]).strip()
            selected_model = str(request.get("model", model_name)).strip() or model_name

            if not audio_path:
                raise RuntimeError("Missing audio path for Moonshine transcription.")

            transcript = transcribe(audio_path, selected_model)
            emit(
                {
                    "id": request_id,
                    "ok": True,
                    "transcript": transcript,
                }
            )
        except Exception as error:
            emit(
                {
                    "id": request.get("id") if isinstance(request, dict) else None,
                    "ok": False,
                    "error": str(error),
                }
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
