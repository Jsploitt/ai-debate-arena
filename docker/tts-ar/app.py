import io

import soundfile as sf
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from transformers import AutoTokenizer, VitsModel

app = FastAPI(title="tts-ar")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cuda" if torch.cuda.is_available() else "cpu"
model = VitsModel.from_pretrained("facebook/mms-tts-ara").to(device)
tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-ara")


class SynthesizeRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    inputs = tokenizer(req.text, return_tensors="pt").to(device)
    with torch.no_grad():
        waveform = model(**inputs).waveform

    audio = waveform.squeeze().cpu().numpy()
    buf = io.BytesIO()
    sf.write(buf, audio, model.config.sampling_rate, format="WAV")
    buf.seek(0)
    return Response(content=buf.read(), media_type="audio/wav")
