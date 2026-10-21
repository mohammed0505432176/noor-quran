"""Noor Quran ASR: Quran-tuned Whisper served on a free CPU Hugging Face Space."""
import hmac
import io
import os
import threading

import librosa
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from transformers import pipeline

MODEL_ID = os.environ.get("MODEL_ID", "deepdml/whisper-base-ar-quran-mix-norm")
MODEL_REVISION = os.environ.get("MODEL_REVISION", "main")  # pin to a commit SHA in production
API_TOKEN = os.environ.get("API_TOKEN", "")
ALLOW_ANON = os.environ.get("ALLOW_ANON") == "1"  # explicit opt-in to run without a token
MAX_BYTES = 10 * 1024 * 1024  # 10 MB upload limit
MAX_CONTENT_LENGTH = 11 * 1024 * 1024  # request-size cap checked before body parsing
MAX_SECONDS = 120  # max audio duration
SR = 16000

torch.set_num_threads(int(os.environ.get("NUM_THREADS", "2")))
app = FastAPI(title="Noor Quran ASR")
lock = threading.Lock()  # one inference at a time on the small CPU
asr = pipeline(
    "automatic-speech-recognition",
    model=MODEL_ID,
    revision=MODEL_REVISION,
    device="cpu",
    model_kwargs={"use_safetensors": True},
)  # loaded at startup
_skip_generate_kwargs = False  # set when the model lacks lang_to_id in its generation_config


def _token_ok(authorization: str | None) -> bool:
    given = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else ""
    return hmac.compare_digest(given.encode(), API_TOKEN.encode())


def check_auth(authorization: str | None) -> None:
    """Require 'Authorization: Bearer <API_TOKEN>' (constant-time compare).
    No token configured -> 503 unless ALLOW_ANON=1."""
    if not API_TOKEN:
        if ALLOW_ANON:
            return
        raise HTTPException(status_code=503, detail="API_TOKEN not set")
    if not _token_ok(authorization):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.middleware("http")
async def precheck(request: Request, call_next):
    """Reject bad auth / oversized bodies before the multipart body is parsed."""
    if request.method == "POST" and request.url.path == "/transcribe":
        if API_TOKEN and not _token_ok(request.headers.get("authorization")):
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > MAX_CONTENT_LENGTH:
            return JSONResponse({"detail": "file too large (max 10 MB)"}, status_code=413)
    return await call_next(request)


def decode_audio(data: bytes) -> np.ndarray:
    """Bytes -> mono 16 kHz float32. Fast path for WAV/FLAC/OGG via soundfile, else librosa+ffmpeg."""
    try:
        audio, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        audio = audio.mean(axis=1)
        if sr != SR:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=SR)
        return np.ascontiguousarray(audio, dtype=np.float32)
    except Exception:
        pass
    # webm/m4a etc.: librosa needs a real file path so audioread/ffmpeg can open it
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        audio, _ = librosa.load(path, sr=SR, mono=True)
        return audio.astype(np.float32)
    finally:
        os.unlink(path)


@app.get("/")
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/transcribe")
def transcribe(
    file: UploadFile = File(...),
    prompt: str | None = Form(None),  # accepted for API compatibility, ignored
    authorization: str | None = Header(None),
):
    global _skip_generate_kwargs
    check_auth(authorization)
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="file too large (max 10 MB)")
    try:  # cheap pre-decode duration check for formats soundfile can open
        if sf.info(io.BytesIO(data)).duration > MAX_SECONDS:
            raise HTTPException(status_code=413, detail=f"audio too long (max {MAX_SECONDS} s)")
    except HTTPException:
        raise
    except Exception:
        pass  # unsupported by soundfile (webm/m4a...): post-decode check below
    try:
        audio = decode_audio(data)
    except Exception:
        raise HTTPException(status_code=400, detail="could not decode audio")
    if audio.size == 0:
        raise HTTPException(status_code=400, detail="empty audio")
    if audio.size > MAX_SECONDS * SR:
        raise HTTPException(status_code=413, detail=f"audio too long (max {MAX_SECONDS} s)")
    inp = {"raw": audio, "sampling_rate": SR}
    with lock:
        out = None
        if not _skip_generate_kwargs:
            try:
                out = asr(inp, chunk_length_s=30, generate_kwargs={"language": "ar", "task": "transcribe"})
            except (ValueError, KeyError):
                _skip_generate_kwargs = True
        if out is None:
            out = asr(inp, chunk_length_s=30)
    return {"text": out["text"].strip(), "model": MODEL_ID}
