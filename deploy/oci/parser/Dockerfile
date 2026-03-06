# Text Parser for ARM64 (OCI Ampere A1)
# Improved: lxml for HWPX, olefile for HWP->HWPX conversion
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONMALLOC=malloc \
    MALLOC_TRIM_THRESHOLD_=100000 \
    PIP_NO_CACHE_DIR=1 \
    WORKERS=1 \
    WEB_CONCURRENCY=1

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    libpq-dev \
    poppler-utils \
    libxml2-dev libxslt1-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# App user
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && mkdir -p /app /app/uploads /app/temp \
    && chown -R appuser:appuser /app

WORKDIR /app

# Dependencies
COPY text_parser/requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt \
    && pip install gunicorn uvloop httptools \
    && rm -rf ~/.cache/pip/*

# Application code
COPY --chown=appuser:appuser text_parser/ .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 10 --timeout-keep-alive 30"]
