import base64
import io
import json
import sys
import warnings
from typing import Dict

import soundfile as sf
from kokoro import KPipeline

warnings.filterwarnings("ignore")

pipelines: Dict[str, KPipeline] = {}


def get_pipeline(lang_code: str) -> KPipeline:
    pipeline = pipelines.get(lang_code)
    if pipeline is None:
        pipeline = KPipeline(repo_id="hexgrad/Kokoro-82M", lang_code=lang_code)
        pipelines[lang_code] = pipeline
    return pipeline


def synthesize(text: str, voice: str, lang_code: str, speed: float) -> str:
    pipeline = get_pipeline(lang_code)
    generator = pipeline(text, voice=voice, speed=speed)

    audio_segments = []
    sample_rate = 24000

    for _, _, audio in generator:
        audio_segments.append(audio)

    if not audio_segments:
        raise RuntimeError("Kokoro did not return any audio segments.")

    if len(audio_segments) == 1:
        combined_audio = audio_segments[0]
    else:
        import numpy as np

        combined_audio = np.concatenate(audio_segments)

    buffer = io.BytesIO()
    sf.write(buffer, combined_audio, sample_rate, format="WAV")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def emit(payload: dict) -> None:
    print(json.dumps(payload), flush=True)


def main() -> int:
    default_lang = "a"
    get_pipeline(default_lang)
    emit({"type": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request = None
        try:
            request = json.loads(line)
            request_id = request["id"]
            text = str(request["text"]).strip()
            voice = str(request.get("voice", "af_heart")).strip() or "af_heart"
            lang_code = str(request.get("lang_code", default_lang)).strip() or default_lang
            speed = float(request.get("speed", 1.0))

            if not text:
                raise RuntimeError("Missing text for Kokoro synthesis.")

            audio_base64 = synthesize(text, voice, lang_code, speed)
            emit(
                {
                    "id": request_id,
                    "ok": True,
                    "audio_base64": audio_base64,
                    "mime_type": "audio/wav",
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
