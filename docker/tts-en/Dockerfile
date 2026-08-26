FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu130

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the Kokoro-82M weights + default voice packs into the image so the
# container doesn't need network access at runtime.
RUN python -c "from kokoro import KPipeline; p = KPipeline(lang_code='a'); [None for _ in p('warm up', voice='af_heart')]; [None for _ in p('warm up', voice='am_michael')]"

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
