import os
import sys
from pathlib import Path

import soundfile as sf
from kokoro import KPipeline


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def main() -> int:
    text = require_env("KOKORO_TEXT")
    output_path = Path(require_env("KOKORO_OUTPUT_PATH"))
    voice = os.environ.get("KOKORO_VOICE", "af_heart").strip() or "af_heart"
    lang_code = os.environ.get("KOKORO_LANG_CODE", "a").strip() or "a"
    speed_value = os.environ.get("KOKORO_SPEED", "1.0").strip() or "1.0"

    try:
        speed = float(speed_value)
    except ValueError as error:
        raise RuntimeError(f"Invalid KOKORO_SPEED: {speed_value}") from error

    output_path.parent.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code=lang_code)
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

    sf.write(output_path, combined_audio, sample_rate)
    print(output_path, flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - runtime wrapper
        print(str(error), file=sys.stderr, flush=True)
        raise SystemExit(1)
