# Railway → OCI Migration + Text Parser Improvement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Railway의 3개 워커 서비스를 OCI Always Free VM으로 마이그레이션하고, Text Parser의 HWP/HWPX 파싱 품질을 개선한다.

**Architecture:** OCI VM(ARM, 4 OCPU, 24GB RAM)에 개별 Docker 컨테이너로 배포. Nginx reverse proxy가 `worker.jerome87.com` 단일 서브도메인으로 path 라우팅. Cloudflare Proxy ON으로 SSL 자동 처리. Text Parser는 pyhwp→HWPX 변환 우선 + 기존 파서 폴백(A+C 하이브리드).

**Tech Stack:** Docker (ARM64), Nginx, Node.js 20, Python 3.11, pyhwp, lxml, hwpxskill patterns

---

## Phase 1: OCI 인프라 준비

### Task 1: OCI 방화벽 포트 오픈

**Step 1: SSH 접속 후 iptables 확인**

```bash
ssh -i /Volumes/포터블/AX/Oracle_Agent/OCI/keys/ssh/oci_n8n_key ubuntu@158.180.81.7
sudo iptables -L INPUT -n --line-numbers | grep -E "80|443"
```

Expected: 포트 80이 ACCEPT 규칙에 없을 수 있음 (n8n은 5678 사용 중)

**Step 2: 포트 80 오픈**

```bash
# iptables에 HTTP 포트 추가
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT

# 영구 저장
sudo netfilter-persistent save
```

Expected: 규칙 추가 완료

**Step 3: OCI Security List 확인**

OCI Console → Networking → Virtual Cloud Networks → Security Lists에서 Ingress Rule 확인:
- Port 80 TCP 0.0.0.0/0 ALLOW 규칙이 있는지 확인
- 없으면 추가 (n8n 설정할 때 이미 있을 가능성 높음)

**Step 4: 검증**

```bash
# 로컬에서 포트 접근 테스트
curl -s -o /dev/null -w "%{http_code}" http://158.180.81.7:80
```

Expected: 연결 가능 (Nginx 설치 전이라 connection refused도 정상)

---

### Task 2: Nginx 설정 파일 작성

**Files:**
- Create: `deploy/oci/nginx/default.conf`
- Create: `deploy/oci/nginx/Dockerfile`

**Step 1: Nginx 설정 작성**

```nginx
# deploy/oci/nginx/default.conf

upstream crawler {
    server 172.17.0.1:3001;
}

upstream embedding {
    server 172.17.0.1:3002;
}

upstream parser {
    server 172.17.0.1:8000;
}

server {
    listen 80;
    server_name worker.jerome87.com;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    # Max upload size (for document parsing)
    client_max_body_size 50M;

    # Health check (Nginx itself)
    location = /health/nginx {
        return 200 '{"status":"ok","service":"nginx"}';
        add_header Content-Type application/json;
    }

    # Crawler Worker (:3001)
    location /crawl {
        proxy_pass http://crawler;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }

    location /health {
        proxy_pass http://crawler/health;
        proxy_set_header Host $host;
        proxy_read_timeout 5s;
    }

    location /test-parser {
        proxy_pass http://crawler;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }

    # Embedding Worker (:3002)
    location /generate-embeddings {
        proxy_pass http://embedding;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 600s;
        proxy_connect_timeout 10s;
    }

    location /analyze-projects {
        proxy_pass http://embedding;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 600s;
    }

    location /embedding-stats {
        proxy_pass http://embedding;
        proxy_set_header Host $host;
        proxy_read_timeout 5s;
    }

    location /analysis-stats {
        proxy_pass http://embedding;
        proxy_set_header Host $host;
        proxy_read_timeout 5s;
    }

    location ~ ^/matching {
        proxy_pass http://embedding;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 600s;
    }

    # Text Parser (:8000)
    location /api/v1/extract {
        proxy_pass http://parser;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        client_max_body_size 50M;
    }

    location /health/parser {
        proxy_pass http://parser/health;
        proxy_set_header Host $host;
        proxy_read_timeout 5s;
    }

    # Default: 404
    location / {
        return 404 '{"error":"Not Found","service":"flowmate-worker"}';
        add_header Content-Type application/json;
    }
}
```

**Step 2: Nginx Dockerfile 작성**

```dockerfile
# deploy/oci/nginx/Dockerfile
FROM nginx:alpine
COPY default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Step 3: 커밋**

```bash
git add deploy/oci/nginx/
git commit -m "feat: add Nginx reverse proxy config for OCI deployment"
```

---

### Task 3: Crawler Worker Dockerfile (ARM)

**Files:**
- Create: `deploy/oci/crawler/Dockerfile`

**Step 1: Dockerfile 작성**

```dockerfile
# deploy/oci/crawler/Dockerfile
# Node.js Worker for ARM64 (OCI Ampere A1)
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate

# Copy dependency files
COPY package.json pnpm-lock.yaml .npmrc* ./
COPY prisma ./prisma/

# Install dependencies (production + dev for tsx)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm run db:generate

# Copy source code
COPY src ./src/
COPY tsconfig.json tsconfig.worker.json ./

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Run crawler worker
CMD ["pnpm", "run", "worker:crawler"]
```

**Step 2: 커밋**

```bash
git add deploy/oci/crawler/
git commit -m "feat: add Crawler Worker Dockerfile for OCI ARM64"
```

---

### Task 4: Embedding Worker Dockerfile (ARM)

**Files:**
- Create: `deploy/oci/embedding/Dockerfile`

**Step 1: Dockerfile 작성**

```dockerfile
# deploy/oci/embedding/Dockerfile
# Node.js Embedding Worker for ARM64 (OCI Ampere A1)
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate

# Copy dependency files
COPY package.json pnpm-lock.yaml .npmrc* ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm run db:generate

# Copy source code
COPY src ./src/
COPY tsconfig.json tsconfig.worker.json ./

EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Override default port to 3002
ENV PORT=3002

# Run embedding worker
CMD ["pnpm", "run", "worker:embedding"]
```

**Step 2: 커밋**

```bash
git add deploy/oci/embedding/
git commit -m "feat: add Embedding Worker Dockerfile for OCI ARM64"
```

---

### Task 5: Text Parser Dockerfile (ARM + lxml + pyhwp)

**Files:**
- Create: `deploy/oci/parser/Dockerfile`

**Step 1: Dockerfile 작성**

```dockerfile
# deploy/oci/parser/Dockerfile
# Python Text Parser for ARM64 (OCI Ampere A1)
# Improved: lxml + pyhwp for HWP→HWPX conversion
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
    && pip install lxml \
    && pip install gunicorn uvloop httptools \
    && rm -rf ~/.cache/pip/*

# Application code
COPY --chown=appuser:appuser text_parser/ .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 10 --timeout-keep-alive 30"]
```

**Step 2: 커밋**

```bash
git add deploy/oci/parser/
git commit -m "feat: add Text Parser Dockerfile for OCI ARM64 with lxml"
```

---

### Task 6: OCI 배포 스크립트

**Files:**
- Create: `deploy/oci/deploy.sh`
- Create: `deploy/oci/README.md`

**Step 1: 배포 스크립트 작성**

```bash
#!/bin/bash
# deploy/oci/deploy.sh
# FlowMate Worker Services deployment to OCI
# Usage: ./deploy.sh [build|start|stop|restart|status|logs]

set -e

PROJECT_DIR="/home/ubuntu/flowmate"
REPO_URL="https://github.com/flowcoder2025/FlowMate.git"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[FlowMate]${NC} $1"; }
warn() { echo -e "${YELLOW}[FlowMate]${NC} $1"; }
error() { echo -e "${RED}[FlowMate]${NC} $1"; }

case "${1:-help}" in
  build)
    log "Building Docker images..."

    cd "$PROJECT_DIR"
    git pull origin main

    # Build Nginx
    log "Building flowmate-nginx..."
    sudo docker build -t flowmate-nginx -f deploy/oci/nginx/Dockerfile deploy/oci/nginx/

    # Build Crawler Worker
    log "Building flowmate-crawler..."
    sudo docker build -t flowmate-crawler -f deploy/oci/crawler/Dockerfile .

    # Build Embedding Worker
    log "Building flowmate-embedding..."
    sudo docker build -t flowmate-embedding -f deploy/oci/embedding/Dockerfile .

    # Build Text Parser
    log "Building flowmate-parser..."
    sudo docker build -t flowmate-parser -f deploy/oci/parser/Dockerfile .

    log "All images built successfully!"
    ;;

  start)
    log "Starting FlowMate services..."

    # Crawler Worker
    sudo docker run -d \
      --restart always \
      --name flowmate-crawler \
      -p 3001:3001 \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=3001 \
      flowmate-crawler

    # Embedding Worker
    sudo docker run -d \
      --restart always \
      --name flowmate-embedding \
      -p 3002:3002 \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=3002 \
      flowmate-embedding

    # Text Parser
    sudo docker run -d \
      --restart always \
      --name flowmate-parser \
      -p 8000:8000 \
      --env-file "$PROJECT_DIR/.env.production" \
      -e PORT=8000 \
      flowmate-parser

    # Nginx (depends on above services being on host network)
    sudo docker run -d \
      --restart always \
      --name flowmate-nginx \
      -p 80:80 \
      flowmate-nginx

    log "All services started!"
    ;;

  stop)
    log "Stopping FlowMate services..."
    sudo docker stop flowmate-nginx flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
    sudo docker rm flowmate-nginx flowmate-crawler flowmate-embedding flowmate-parser 2>/dev/null || true
    log "All services stopped."
    ;;

  restart)
    $0 stop
    sleep 2
    $0 start
    ;;

  status)
    log "Service Status:"
    echo ""
    sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
      --filter "name=flowmate-" 2>/dev/null || echo "No services running"
    echo ""

    # Health checks
    for svc in "crawler:3001" "embedding:3002" "parser:8000"; do
      name="${svc%%:*}"
      port="${svc##*:}"
      status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/health" 2>/dev/null || echo "000")
      if [ "$status" = "200" ]; then
        echo -e "  ${GREEN}✓${NC} $name (:$port) - healthy"
      else
        echo -e "  ${RED}✗${NC} $name (:$port) - unhealthy ($status)"
      fi
    done

    # Nginx
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80/health/nginx" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
      echo -e "  ${GREEN}✓${NC} nginx (:80) - healthy"
    else
      echo -e "  ${RED}✗${NC} nginx (:80) - unhealthy ($status)"
    fi
    ;;

  logs)
    SERVICE="${2:-flowmate-crawler}"
    sudo docker logs --tail 100 -f "$SERVICE"
    ;;

  *)
    echo "Usage: $0 {build|start|stop|restart|status|logs [service]}"
    echo ""
    echo "Services: flowmate-crawler, flowmate-embedding, flowmate-parser, flowmate-nginx"
    ;;
esac
```

**Step 2: README 작성**

```markdown
# deploy/oci/README.md
# FlowMate OCI Deployment

## Prerequisites
- OCI VM: Ampere A1.Flex (4 OCPU, 24GB RAM)
- Docker installed
- Cloudflare DNS: worker.jerome87.com → 158.180.81.7 (Proxy ON)

## Setup
1. Clone repo: `git clone <repo> /home/ubuntu/flowmate`
2. Copy env: `cp .env.example .env.production` and fill values
3. Build: `./deploy/oci/deploy.sh build`
4. Start: `./deploy/oci/deploy.sh start`
5. Verify: `./deploy/oci/deploy.sh status`

## Commands
- `./deploy.sh build` - Build all Docker images
- `./deploy.sh start` - Start all services
- `./deploy.sh stop` - Stop all services
- `./deploy.sh restart` - Restart all services
- `./deploy.sh status` - Check health of all services
- `./deploy.sh logs [service]` - Tail logs
```

**Step 3: 커밋**

```bash
chmod +x deploy/oci/deploy.sh
git add deploy/oci/
git commit -m "feat: add OCI deployment script and README"
```

---

## Phase 2: Text Parser 개선

### Task 7: HWPX 파서 전면 개편 (lxml 기반)

**Files:**
- Modify: `text_parser/app/services/hwpx_parser.py`
- Reference: hwpxskill `text_extract.py` 패턴

**Step 1: hwpx_parser.py 전면 재작성**

기존 `xml.etree.ElementTree` → `lxml.etree` + XPath 기반으로 전환.
핵심 개선:
- 문단 구조 보존 (paragraph → run → text 계층)
- 표 구조 정밀 추출 (셀 병합, span 인식)
- 마크다운 출력 지원
- Preview 텍스트 폴백 제거 (항상 section XML 우선)

```python
# text_parser/app/services/hwpx_parser.py
"""
HWPX Parser v3.0 - lxml + OWPML standard based
Based on hwpxskill patterns for accurate text extraction.
"""
import structlog
import zipfile
from lxml import etree
from typing import Dict, Any, List, Optional
import re

logger = structlog.get_logger()

# OWPML Namespaces
NS = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hp10': 'http://www.hancom.co.kr/hwpml/2016/paragraph',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'ha': 'http://www.hancom.co.kr/hwpml/2011/app',
    'hpf': 'http://www.hancom.co.kr/schema/2011/hpf',
}


class HWPXParser:
    """Parser for HWPX (OWPML XML-based) files using lxml."""

    def parse(self, file_path: str) -> Dict[str, Any]:
        """Parse HWPX file and extract structured content."""
        result = {
            "paragraphs": [],
            "tables": [],
            "images": [],
            "metadata": {},
            "text": "",
            "markdown": "",
            "structure": {"sections": [], "total_sections": 0},
        }

        try:
            logger.info("HWPX parsing started (v3.0 lxml)", file_path=file_path)

            with zipfile.ZipFile(file_path, 'r') as zf:
                result["metadata"] = self._extract_metadata(zf)
                sections = self._find_sections(zf)

                all_paragraphs = []
                all_tables = []
                md_lines = []

                for idx, section_xml in enumerate(sections):
                    root = etree.fromstring(section_xml)
                    section_info = {"section_id": f"section{idx}"}

                    # Extract paragraphs (top-level only, skip nested in tables)
                    paragraphs = self._extract_paragraphs(root)
                    section_info["paragraph_count"] = len(paragraphs)
                    all_paragraphs.extend(paragraphs)

                    # Extract tables
                    tables = self._extract_tables(root)
                    section_info["table_count"] = len(tables)
                    all_tables.extend(tables)

                    # Build markdown
                    md_lines.extend(self._build_markdown(root))

                    result["structure"]["sections"].append(section_info)

                result["structure"]["total_sections"] = len(sections)
                result["paragraphs"] = all_paragraphs
                result["tables"] = all_tables
                result["text"] = '\n'.join(
                    p["text"] for p in all_paragraphs if p["text"].strip()
                )
                result["markdown"] = '\n'.join(md_lines)

                logger.info("HWPX parsing complete",
                           text_length=len(result["text"]),
                           paragraphs=len(all_paragraphs),
                           tables=len(all_tables))

        except Exception as e:
            logger.error("HWPX parsing error", error=str(e), file_path=file_path)
            raise

        return result

    def _find_sections(self, zf: zipfile.ZipFile) -> List[bytes]:
        """Find and read all section XML files."""
        section_files = sorted(
            f for f in zf.namelist()
            if f.startswith('Contents/section') and f.endswith('.xml')
        )
        sections = []
        for sf in section_files:
            try:
                sections.append(zf.read(sf))
            except Exception as e:
                logger.warning("Failed to read section", file=sf, error=str(e))
        return sections

    def _extract_metadata(self, zf: zipfile.ZipFile) -> Dict[str, Any]:
        """Extract metadata from header.xml and version.xml."""
        metadata = {}
        try:
            if 'version.xml' in zf.namelist():
                root = etree.fromstring(zf.read('version.xml'))
                version = root.get('version')
                if version:
                    metadata['hwp_version'] = version

            if 'Contents/header.xml' in zf.namelist():
                root = etree.fromstring(zf.read('Contents/header.xml'))
                metadata['has_header'] = True

                # Extract font info
                fonts = []
                for face in root.iter():
                    if face.tag.endswith('}font'):
                        name = face.get('name')
                        if name:
                            fonts.append(name)
                if fonts:
                    metadata['fonts'] = list(set(fonts))

        except Exception as e:
            logger.debug("Metadata extraction failed", error=str(e))
        return metadata

    def _extract_paragraphs(self, root: etree._Element) -> List[Dict[str, Any]]:
        """Extract paragraphs preserving run structure."""
        paragraphs = []

        for p in self._find_elements(root, 'p'):
            # Skip paragraphs inside table cells (subList)
            parent = p.getparent()
            if parent is not None and self._local_name(parent) == 'subList':
                continue

            para_text = self._get_paragraph_text(p)
            style = {
                'paraPrIDRef': p.get('paraPrIDRef', '0'),
                'styleIDRef': p.get('styleIDRef', '0'),
            }

            # Detect bold runs
            has_bold = False
            for run in self._find_elements(p, 'run'):
                char_ref = run.get('charPrIDRef', '0')
                if char_ref != '0':
                    has_bold = True

            paragraphs.append({
                "text": para_text,
                "style": style,
                "has_emphasis": has_bold,
            })

        return paragraphs

    def _extract_tables(self, root: etree._Element) -> List[Dict[str, Any]]:
        """Extract tables with cell span information."""
        tables = []

        for tbl in self._find_elements(root, 'tbl'):
            row_cnt = tbl.get('rowCnt', '0')
            col_cnt = tbl.get('colCnt', '0')
            rows = []

            for tr in self._find_elements(tbl, 'tr'):
                cells = []
                for tc in self._find_elements(tr, 'tc'):
                    cell_text = self._get_cell_text(tc)

                    # Get span info
                    col_span = '1'
                    row_span = '1'
                    for span_el in self._find_elements(tc, 'cellSpan'):
                        col_span = span_el.get('colSpan', '1')
                        row_span = span_el.get('rowSpan', '1')

                    cells.append({
                        "text": cell_text,
                        "colSpan": int(col_span),
                        "rowSpan": int(row_span),
                    })

                if cells:
                    rows.append(cells)

            if rows:
                tables.append({
                    "rows": rows,
                    "row_count": int(row_cnt),
                    "col_count": int(col_cnt),
                })

        return tables

    def _build_markdown(self, root: etree._Element) -> List[str]:
        """Build markdown output preserving document structure."""
        lines = []

        for child in root:
            local = self._local_name(child)

            if local == 'p':
                # Skip paragraphs inside tables
                text = self._get_paragraph_text(child)

                if not text.strip():
                    lines.append('')
                    continue

                # Check for heading-like styles
                style_ref = child.get('paraPrIDRef', '0')
                if style_ref in ('1', '2', '3'):
                    level = int(style_ref)
                    lines.append(f"{'#' * level} {text}")
                else:
                    lines.append(text)

            # If paragraph contains a table, render it
            for tbl in self._find_elements(child, 'tbl'):
                table_md = self._table_to_markdown(tbl)
                lines.extend(table_md)
                lines.append('')

        return lines

    def _table_to_markdown(self, tbl: etree._Element) -> List[str]:
        """Convert table element to markdown table."""
        rows = []
        for tr in self._find_elements(tbl, 'tr'):
            cells = []
            for tc in self._find_elements(tr, 'tc'):
                cells.append(self._get_cell_text(tc).replace('|', '\\|'))
            rows.append(cells)

        if not rows:
            return []

        md = []
        # Header row
        md.append('| ' + ' | '.join(rows[0]) + ' |')
        md.append('| ' + ' | '.join('---' for _ in rows[0]) + ' |')
        # Data rows
        for row in rows[1:]:
            # Pad if needed
            while len(row) < len(rows[0]):
                row.append('')
            md.append('| ' + ' | '.join(row[:len(rows[0])]) + ' |')

        return md

    def _get_paragraph_text(self, p: etree._Element) -> str:
        """Extract text from paragraph (all runs concatenated)."""
        texts = []
        for t_elem in self._find_elements(p, 't'):
            if t_elem.text:
                texts.append(t_elem.text)
        return ''.join(texts)

    def _get_cell_text(self, tc: etree._Element) -> str:
        """Extract text from table cell (all paragraphs joined)."""
        texts = []
        for t_elem in self._find_elements(tc, 't'):
            if t_elem.text:
                texts.append(t_elem.text)
        return ' '.join(texts).strip()

    def _find_elements(self, root: etree._Element, local_name: str):
        """Find elements by local name across all known namespaces."""
        results = []
        for ns_uri in [NS['hp'], NS.get('hp10', '')]:
            if ns_uri:
                results.extend(root.iter(f'{{{ns_uri}}}{local_name}'))
        return results

    def _local_name(self, elem: etree._Element) -> str:
        """Get local name from namespaced tag."""
        tag = elem.tag
        if '}' in tag:
            return tag.split('}', 1)[1]
        return tag

    def _clean_text(self, text: str) -> str:
        """Clean text content (remove zero-width chars, normalize whitespace)."""
        if not text:
            return ""
        cleaned = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', text)
        cleaned = re.sub(r'\s+', ' ', cleaned)
        return cleaned.strip()


def parse(file_path: str) -> Dict[str, Any]:
    """Parse HWPX file using HWPXParser."""
    parser = HWPXParser()
    return parser.parse(file_path)
```

**Step 2: 커밋**

```bash
git add text_parser/app/services/hwpx_parser.py
git commit -m "feat: rewrite HWPX parser with lxml + OWPML structure"
```

---

### Task 8: HWP → HWPX 변환 모듈 (pyhwp 기반)

**Files:**
- Create: `text_parser/app/services/hwp_to_hwpx.py`

**Step 1: HWP→HWPX 변환 모듈 작성**

pyhwp로 HWP5 바이너리의 BodyText 스트림에서 레코드를 추출하고,
hwpxskill의 OWPML XML 구조로 HWPX를 조립하는 모듈.

```python
# text_parser/app/services/hwp_to_hwpx.py
"""
HWP to HWPX converter using pyhwp + OWPML XML assembly.

Strategy:
1. Parse HWP5 binary with olefile (pyhwp internals)
2. Extract text records from BodyText streams
3. Assemble into OWPML-compliant HWPX (ZIP with XML)
4. Return path to temporary HWPX file

Fallback: If conversion fails, returns None (caller uses legacy HWP parsers)
"""
import structlog
import tempfile
import zipfile
import os
import zlib
import struct
from lxml import etree
from typing import Optional, List, Tuple
import olefile

logger = structlog.get_logger()

# OWPML namespaces
HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
HS_NS = 'http://www.hancom.co.kr/hwpml/2011/section'
HH_NS = 'http://www.hancom.co.kr/hwpml/2011/head'
HC_NS = 'http://www.hancom.co.kr/hwpml/2011/core'

HWPTAG_PARA_TEXT = 0x42  # Tag ID for paragraph text records


class HwpToHwpxConverter:
    """Convert HWP5 binary to HWPX format for unified parsing."""

    def convert(self, hwp_path: str) -> Optional[str]:
        """
        Convert HWP file to temporary HWPX file.

        Returns:
            Path to temporary HWPX file, or None if conversion fails.
            Caller is responsible for deleting the temp file.
        """
        try:
            logger.info("HWP→HWPX conversion started", file=hwp_path)

            if not olefile.isOleFile(hwp_path):
                logger.warning("Not a valid OLE file", file=hwp_path)
                return None

            ole = olefile.OleFileIO(hwp_path)

            try:
                # Check if compressed
                is_compressed = self._is_compressed(ole)

                # Extract text from all BodyText sections
                sections_text = self._extract_body_text(ole, is_compressed)

                if not sections_text:
                    logger.warning("No text extracted from HWP", file=hwp_path)
                    return None

                # Build HWPX
                hwpx_path = self._build_hwpx(sections_text)

                total_chars = sum(len(t) for texts in sections_text for t in texts)
                logger.info("HWP→HWPX conversion complete",
                           sections=len(sections_text),
                           total_chars=total_chars,
                           output=hwpx_path)

                return hwpx_path

            finally:
                ole.close()

        except Exception as e:
            logger.error("HWP→HWPX conversion failed", error=str(e), file=hwp_path)
            return None

    def _is_compressed(self, ole: olefile.OleFileIO) -> bool:
        """Check if HWP file body is compressed."""
        try:
            if ole.exists('FileHeader'):
                header = ole.openstream('FileHeader').read()
                if len(header) >= 36:
                    flags = struct.unpack_from('<I', header, 32)[0]
                    return bool(flags & 0x01)
        except Exception:
            pass
        return True  # Default to compressed

    def _extract_body_text(self, ole: olefile.OleFileIO, compressed: bool) -> List[List[str]]:
        """Extract text from all BodyText sections."""
        sections = []

        # Find all BodyText/SectionN streams
        section_idx = 0
        while True:
            stream_name = f'BodyText/Section{section_idx}'
            if not ole.exists(stream_name):
                break

            try:
                data = ole.openstream(stream_name).read()
                if compressed:
                    try:
                        data = zlib.decompress(data, -15)
                    except zlib.error:
                        try:
                            data = zlib.decompress(data)
                        except zlib.error:
                            logger.warning("Decompression failed",
                                         section=section_idx)
                            section_idx += 1
                            continue

                texts = self._parse_records(data)
                if texts:
                    sections.append(texts)

            except Exception as e:
                logger.warning("Section extraction failed",
                             section=section_idx, error=str(e))

            section_idx += 1

        return sections

    def _parse_records(self, data: bytes) -> List[str]:
        """Parse HWP5 record structure and extract PARA_TEXT records."""
        texts = []
        pos = 0

        while pos < len(data) - 4:
            try:
                header = struct.unpack_from('<I', data, pos)[0]
                tag_id = header & 0x3FF
                # level = (header >> 10) & 0x3FF
                size = (header >> 20) & 0xFFF

                if size == 0xFFF:
                    if pos + 8 > len(data):
                        break
                    size = struct.unpack_from('<I', data, pos + 4)[0]
                    pos += 8
                else:
                    pos += 4

                if pos + size > len(data):
                    break

                if tag_id == HWPTAG_PARA_TEXT:
                    text = self._decode_para_text(data[pos:pos + size])
                    if text and text.strip():
                        texts.append(text.strip())

                pos += size

            except Exception:
                pos += 1  # Skip corrupted byte and continue

        return texts

    def _decode_para_text(self, data: bytes) -> str:
        """Decode paragraph text record (UTF-16LE with control chars)."""
        chars = []
        i = 0
        length = len(data)

        while i < length - 1:
            code = struct.unpack_from('<H', data, i)[0]
            i += 2

            if code == 0:
                break
            elif code < 0x20:
                # Control characters - skip extended data
                if code in (1, 2, 3, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23):
                    i += 12  # Skip 12-byte inline control data
                elif code == 4 or code == 5 or code == 6 or code == 7 or code == 8 or code == 9 or code == 10:
                    i += 12
                elif code == 24:
                    i += 14
                # Line break
                if code == 13:
                    chars.append('\n')
                elif code == 9:
                    chars.append('\t')
            else:
                chars.append(chr(code))

        return ''.join(chars)

    def _build_hwpx(self, sections_text: List[List[str]]) -> str:
        """Build a minimal HWPX file from extracted text."""
        tmp = tempfile.NamedTemporaryFile(suffix='.hwpx', delete=False)
        tmp_path = tmp.name
        tmp.close()

        with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # mimetype (must be first, uncompressed)
            zf.writestr('mimetype', 'application/hwp+zip',
                        compress_type=zipfile.ZIP_STORED)

            # version.xml
            zf.writestr('version.xml',
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<hv:HWPVersion version="1.1" xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version"/>')

            # META-INF/container.xml
            zf.writestr('META-INF/container.xml',
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
                '  <rootfiles>\n'
                '    <rootfile full-path="Contents/content.hpf" '
                'media-type="application/hwp+zip"/>\n'
                '  </rootfiles>\n'
                '</container>')

            # header.xml (minimal)
            header_xml = self._build_header_xml()
            zf.writestr('Contents/header.xml', header_xml)

            # section files
            for idx, texts in enumerate(sections_text):
                section_xml = self._build_section_xml(texts)
                zf.writestr(f'Contents/section{idx}.xml', section_xml)

            # content.hpf (manifest)
            hpf = self._build_content_hpf(len(sections_text))
            zf.writestr('Contents/content.hpf', hpf)

        return tmp_path

    def _build_header_xml(self) -> str:
        """Build minimal header.xml with basic styles."""
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<hh:head xmlns:hh="{HH_NS}" xmlns:hc="{HC_NS}">\n'
            '  <hh:fontfaces>\n'
            '    <hh:fontface lang="hangul"><hh:font id="0" name="함초롬바탕"/></hh:fontface>\n'
            '    <hh:fontface lang="latin"><hh:font id="0" name="Times New Roman"/></hh:fontface>\n'
            '  </hh:fontfaces>\n'
            '  <hh:charProperties itemCnt="1">\n'
            f'    <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none"'
            f' useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0">\n'
            '      <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>\n'
            '      <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>\n'
            '      <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>\n'
            '      <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>\n'
            '      <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>\n'
            '    </hh:charPr>\n'
            '  </hh:charProperties>\n'
            '  <hh:paraProperties itemCnt="1">\n'
            '    <hh:paraPr id="0" align="JUSTIFY">\n'
            '      <hh:margin indent="0" left="0" right="0"/>\n'
            '      <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>\n'
            '    </hh:paraPr>\n'
            '  </hh:paraProperties>\n'
            '  <hh:borderFills itemCnt="1">\n'
            '    <hh:borderFill id="1"><hh:slash/><hh:backSlash/></hh:borderFill>\n'
            '  </hh:borderFills>\n'
            '</hh:head>'
        )

    def _build_section_xml(self, texts: List[str]) -> str:
        """Build section XML from extracted text paragraphs."""
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            f'<hs:sec xmlns:hp="{HP_NS}" xmlns:hs="{HS_NS}">',
        ]

        for idx, text in enumerate(texts):
            para_id = 1000000001 + idx
            # Escape XML special characters
            escaped = (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;')
            )

            if idx == 0:
                # First paragraph includes secPr
                lines.append(
                    f'  <hp:p id="{para_id}" paraPrIDRef="0" styleIDRef="0"'
                    f' pageBreak="0" columnBreak="0" merged="0">'
                )
                lines.append('    <hp:run charPrIDRef="0">')
                lines.append('      <hp:secPr textDirection="HORIZONTAL"'
                           ' spaceColumns="1134" tabStop="8000"'
                           ' outlineShapeIDRef="0" memoShapeIDRef="0"'
                           ' textVerticalWidthHead="0">')
                lines.append('        <hp:pagePr landscape="WIDELY"'
                           ' width="59528" height="84186" gutterType="LEFT_ONLY">')
                lines.append('          <hp:margin header="4252" footer="4252"'
                           ' gutter="0" left="8504" right="8504"'
                           ' top="5668" bottom="4252"/>')
                lines.append('        </hp:pagePr>')
                lines.append('      </hp:secPr>')
                lines.append('      <hp:ctrl>')
                lines.append('        <hp:colPr id="" type="NEWSPAPER"'
                           ' layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>')
                lines.append('      </hp:ctrl>')
                lines.append('    </hp:run>')
                lines.append(f'    <hp:run charPrIDRef="0"><hp:t>{escaped}</hp:t></hp:run>')
                lines.append('  </hp:p>')
            else:
                if escaped:
                    lines.append(
                        f'  <hp:p id="{para_id}" paraPrIDRef="0" styleIDRef="0"'
                        f' pageBreak="0" columnBreak="0" merged="0">'
                    )
                    lines.append(f'    <hp:run charPrIDRef="0"><hp:t>{escaped}</hp:t></hp:run>')
                    lines.append('  </hp:p>')
                else:
                    lines.append(
                        f'  <hp:p id="{para_id}" paraPrIDRef="0" styleIDRef="0"'
                        f' pageBreak="0" columnBreak="0" merged="0">'
                    )
                    lines.append('    <hp:run charPrIDRef="0"><hp:t/></hp:run>')
                    lines.append('  </hp:p>')

        lines.append('</hs:sec>')
        return '\n'.join(lines)

    def _build_content_hpf(self, section_count: int) -> str:
        """Build content.hpf manifest."""
        items = ['    <opf:item id="header" href="header.xml" media-type="text/xml"/>']
        for i in range(section_count):
            items.append(
                f'    <opf:item id="section{i}" href="section{i}.xml" media-type="text/xml"/>'
            )

        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/">\n'
            '  <opf:manifest>\n'
            + '\n'.join(items) + '\n'
            '  </opf:manifest>\n'
            '</opf:package>'
        )


def convert_hwp_to_hwpx(hwp_path: str) -> Optional[str]:
    """Convert HWP file to HWPX. Returns temp file path or None."""
    converter = HwpToHwpxConverter()
    return converter.convert(hwp_path)
```

**Step 2: 커밋**

```bash
git add text_parser/app/services/hwp_to_hwpx.py
git commit -m "feat: add HWP→HWPX converter using pyhwp + OWPML assembly"
```

---

### Task 9: HWP 파서 오케스트레이터 업데이트 (A+C 하이브리드)

**Files:**
- Modify: `text_parser/app/services/hwp_parser.py`

**Step 1: hwp_parser.py 수정 — 변환 우선 + 폴백 패턴 추가**

기존 오케스트레이터에 HWP→HWPX 변환 경로를 최우선으로 추가.
변환 실패 시 기존 다중 파서 폴백.

핵심 변경:
- `parse()` 메서드 시작 부분에 `convert_hwp_to_hwpx()` 시도
- 변환 성공 시 → 새 `HWPXParser`로 파싱
- 변환 실패 시 → 기존 `EnhancedHWPParser` → `ImprovedHWPParser` → `HybridHWPParser` 폴백

변경할 위치: `parse()` 메서드의 맨 앞에 변환 로직 삽입

```python
# hwp_parser.py parse() 메서드 상단에 추가할 코드:

from .hwp_to_hwpx import convert_hwp_to_hwpx
from .hwpx_parser import HWPXParser as LxmlHWPXParser
import os

# parse() 메서드 내부 - 기존 파서 시도 전에 삽입:
def parse(self, file_path: str) -> Dict[str, Any]:
    # [A] HWP→HWPX conversion attempt (priority)
    try:
        hwpx_path = convert_hwp_to_hwpx(file_path)
        if hwpx_path:
            try:
                hwpx_parser = LxmlHWPXParser()
                result = hwpx_parser.parse(hwpx_path)
                if result.get("text") and len(result["text"]) > 100:
                    logger.info("HWP parsed via HWPX conversion",
                               text_length=len(result["text"]))
                    result["parse_method"] = "hwp_to_hwpx_conversion"
                    return result
            finally:
                # Clean up temp file
                try:
                    os.unlink(hwpx_path)
                except OSError:
                    pass
    except Exception as e:
        logger.warning("HWP→HWPX conversion skipped", error=str(e))

    # [C] Fallback: existing multi-parser strategy
    # ... (기존 코드 유지)
```

**Step 2: 커밋**

```bash
git add text_parser/app/services/hwp_parser.py
git commit -m "feat: integrate HWP→HWPX conversion as primary parse strategy"
```

---

### Task 10: requirements.txt에 lxml 추가

**Files:**
- Modify: `text_parser/requirements.txt`

**Step 1: lxml 의존성 추가**

```
# requirements.txt에 추가 (olefile은 pyhwp 의존성으로 이미 포함)
lxml>=5.0.0
```

**Step 2: 커밋**

```bash
git add text_parser/requirements.txt
git commit -m "feat: add lxml dependency for HWPX parser"
```

---

## Phase 3: FlowMate 코드 변경

### Task 11: railway.ts URL 정리

**Files:**
- Modify: `src/lib/railway.ts` (lines 15-20)

**Step 1: 하드코딩 Railway URL 제거, 환경변수만 사용**

```typescript
// 변경 전:
const CRAWLER_SERVICE_URL =
  process.env.RAILWAY_CRAWLER_URL ||
  "https://crawler-production-5fd6.up.railway.app";

// 변경 후:
const CRAWLER_SERVICE_URL =
  process.env.RAILWAY_CRAWLER_URL ||
  process.env.WORKER_BASE_URL ||
  "https://worker.jerome87.com";
```

마찬가지로 `AI_PROCESSOR_URL`도 동일하게 변경.

**Step 2: 커밋**

```bash
git add src/lib/railway.ts
git commit -m "refactor: replace hardcoded Railway URLs with OCI worker URL"
```

---

### Task 12: .env.example 업데이트

**Files:**
- Modify: `.env.example` (lines 80-97)

**Step 1: Railway → OCI URL로 변경**

```env
# [Worker Services] - OCI VM (worker.jerome87.com)
# Nginx reverse proxy routes to individual services by path
RAILWAY_CRAWLER_URL="https://worker.jerome87.com"
RAILWAY_WORKER_URL="https://worker.jerome87.com"

# Worker API Key (shared across all workers)
WORKER_API_KEY="your-worker-api-key"

# Text Parser (internal to OCI, accessed via Nginx)
TEXT_PARSER_URL="https://worker.jerome87.com"
```

**Step 2: 커밋**

```bash
git add .env.example
git commit -m "docs: update .env.example with OCI worker URLs"
```

---

## Phase 4: OCI 배포 + 트래픽 전환

### Task 13: OCI에 코드 배포 + Docker 빌드

**Step 1: SSH 접속 + 레포 클론**

```bash
ssh -i /Volumes/포터블/AX/Oracle_Agent/OCI/keys/ssh/oci_n8n_key ubuntu@158.180.81.7

# Clone repo
git clone https://github.com/flowcoder2025/FlowMate.git /home/ubuntu/flowmate
cd /home/ubuntu/flowmate
```

**Step 2: .env.production 작성**

```bash
# Vercel 환경변수에서 필요한 값 복사
cat > .env.production << 'EOF'
DATABASE_URL=<from Vercel>
DIRECT_URL=<from Vercel>
OPENAI_API_KEY=<from Vercel>
GOOGLE_GENERATIVE_AI_API_KEY=<from Vercel>
WORKER_API_KEY=<from Vercel>
NEXT_PUBLIC_SUPABASE_URL=<from Vercel>
SUPABASE_SERVICE_KEY=<from Vercel>
TEXT_PARSER_URL=http://172.17.0.1:8000
PORT=3001
NODE_ENV=production
EOF
```

**Step 3: Docker 이미지 빌드**

```bash
chmod +x deploy/oci/deploy.sh
./deploy/oci/deploy.sh build
```

Expected: 4개 이미지 빌드 성공

**Step 4: 서비스 시작**

```bash
./deploy/oci/deploy.sh start
```

**Step 5: 상태 확인**

```bash
./deploy/oci/deploy.sh status
```

Expected: 4개 서비스 모두 healthy

---

### Task 14: Cloudflare + 외부 접근 검증

**Step 1: Cloudflare 경유 health check**

```bash
# 로컬 머신에서 실행
curl -s https://worker.jerome87.com/health | jq .
curl -s https://worker.jerome87.com/health/parser | jq .
curl -s https://worker.jerome87.com/health/nginx | jq .
```

Expected: 각각 `{"status":"ok"}` 형태의 응답

**Step 2: 인증 포함 엔드포인트 테스트**

```bash
curl -s https://worker.jerome87.com/embedding-stats \
  -H "Authorization: Bearer ${WORKER_API_KEY}" | jq .
```

Expected: 임베딩 통계 JSON 응답

---

### Task 15: Vercel 환경변수 전환

**Step 1: Vercel Dashboard에서 환경변수 변경**

```
RAILWAY_CRAWLER_URL  →  https://worker.jerome87.com
RAILWAY_WORKER_URL   →  https://worker.jerome87.com
TEXT_PARSER_URL      →  https://worker.jerome87.com
```

Production + Preview 모두 적용.

**Step 2: Vercel 재배포**

Deployments → 최신 배포 → Redeploy

**Step 3: Cron 트리거 테스트**

```bash
# Admin API로 수동 트리거
curl -X POST https://mate.flow-coder.com/api/cron/generate-embeddings \
  -H "Authorization: Bearer ${WORKER_API_KEY}" | jq .
```

Expected: 202 Accepted (OCI 워커에서 처리)

---

## Phase 5: Railway 정리

### Task 16: Railway 서비스 중지 + 정리

**Step 1: 24시간 OCI 모니터링 확인**

```bash
# OCI에서 로그 확인
./deploy/oci/deploy.sh logs flowmate-crawler
./deploy/oci/deploy.sh logs flowmate-embedding
```

정상 동작 확인 후 진행.

**Step 2: Railway Dashboard에서 서비스 중지**

Railway Dashboard → 각 서비스 → Settings → Delete Service

**Step 3: GitHub Actions 정리**

```bash
# railway-restart.yml 제거
git rm .github/workflows/railway-restart.yml
git commit -m "chore: remove Railway restart workflow (migrated to OCI)"
```

**Step 4: railway.toml, nixpacks.toml 정리**

```bash
# 더 이상 필요 없는 Railway 설정 파일 제거
git rm railway.toml nixpacks.toml
git rm text_parser/railway.toml
git commit -m "chore: remove Railway config files (migrated to OCI)"
```

---

## Verification Checklist

| 항목 | 검증 방법 | 기대 결과 |
|------|-----------|-----------|
| Nginx 라우팅 | `curl https://worker.jerome87.com/health` | 200 OK |
| Crawler Worker | `curl -X POST .../crawl -H "Auth: Bearer ..."` | 202 Accepted |
| Embedding Worker | `curl -X POST .../generate-embeddings` | 202 Accepted |
| Text Parser (HWPX) | `curl -X POST .../api/v1/extract/hwp-to-json` | 파싱 결과 |
| Text Parser (HWP→HWPX) | HWP 파일 업로드 파싱 | 텍스트 추출 |
| Vercel Cron | 자동 스케줄 대기 후 OCI 로그 확인 | 정상 처리 |
| 메모리 안정성 | 24시간 후 `docker stats` | RSS < 2GB |
| SSL | `curl -vI https://worker.jerome87.com` | Cloudflare SSL |
