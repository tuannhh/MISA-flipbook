FROM python:3.12-slim

# Ghi chu: PDFium tu render dua tren font da nhung trong PDF; PDF khong nhung font
# se phu thuoc font he thong container (chua cai them fonts-noto/fonts-liberation
# o day). Day la viec con mo, ghi trong MEMORYBANK.md truoc khi coi P0/P2 xong voi
# corpus PDF that khong nhung font.

RUN groupadd --system app && useradd --system --gid app --home-dir /app app
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN mkdir -p /data/storage && chown -R app:app /app /data/storage
USER app
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
