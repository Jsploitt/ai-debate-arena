FROM python:3.12-slim-bookworm

WORKDIR /app

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu130

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the mms-tts-ara weights into the image so the container doesn't need
# network access at runtime.
RUN python -c "from transformers import AutoTokenizer, VitsModel; VitsModel.from_pretrained('facebook/mms-tts-ara'); AutoTokenizer.from_pretrained('facebook/mms-tts-ara')"

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
