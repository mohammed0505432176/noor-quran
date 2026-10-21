FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# HF Spaces run as user 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH HF_HOME=/home/user/.cache/huggingface
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the model at build time so cold starts are fast
ARG MODEL_ID=deepdml/whisper-base-ar-quran-mix-norm
ENV MODEL_ID=${MODEL_ID}
RUN python -c "import os; from transformers import pipeline; pipeline('automatic-speech-recognition', model=os.environ['MODEL_ID'], device='cpu')"

COPY --chown=user app.py .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
