import io
import re

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from kokoro import KPipeline
from pydantic import BaseModel

app = FastAPI(title="tts-en")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = KPipeline(lang_code="a", device="cuda" if torch.cuda.is_available() else "cpu")
SAMPLE_RATE = 24000


class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "af_kore"


def clean_text(text: str) -> str:
    text = re.sub(r"\*\*|\*|__|_", "", text)
    return re.sub(r"\s+", " ", text).strip()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    text = clean_text(req.text)
    chunks = []
    for _, _, audio in pipeline(text, voice=req.voice):
        chunks.append(audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio))

    waveform = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
    buf = io.BytesIO()
    sf.write(buf, waveform, SAMPLE_RATE, format="WAV")
    buf.seek(0)
    return Response(content=buf.read(), media_type="audio/wav")
