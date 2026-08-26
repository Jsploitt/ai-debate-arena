FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu130

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the Kokoro-82M weights and the four character voice packs into the
# image. Kokoro fetches a voice pack the first time it is used, so a voice
# that is not baked in needs network access at runtime -- and the booth has
# none. These four are the voices in lib/characters.ts; the slot defaults in
# presets.ts point at two of them for the same reason.
RUN python -c "from kokoro import KPipeline; p = KPipeline(lang_code='a'); [[None for _ in p('warm up', voice=v)] for v in ('am_adam', 'af_kore', 'af_sarah', 'am_echo')]"

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
