"""FastAPI noi bo cho pdf-worker.

Chi duoc goi tu dispatcher qua mang noi bo Docker Compose (khong public). Xac
thuc bang shared-secret header don gian - du cho pilot; production nen doi
sang mTLS hoac network policy chat hon (ghi trong MEMORYBANK.md nhu viec con
mo). Worker KHONG tu fetch file tu URL ngoai - chi doc file da co san tren
volume storage dung chung, dung ARCHITECTURE.md muc 2 ("worker khong co
outbound network mac dinh").
"""

from __future__ import annotations

import os
import pathlib

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .convert import ConversionError, convert_pdf

STORAGE_ROOT = pathlib.Path(os.environ["STORAGE_ROOT"]).resolve()
INTERNAL_API_TOKEN = os.environ["INTERNAL_API_TOKEN"]

app = FastAPI(title="MISA Flipbook PDF Worker (internal)")


class ConvertRequest(BaseModel):
    source_key: str  # duong dan tuong doi trong STORAGE_ROOT, vd tenant/book/revision/source.pdf
    output_key: str  # thu muc tuong doi de ghi anh + manifest
    pipeline_version: str
    password: str | None = None


def _resolve_safe(relative_key: str) -> pathlib.Path:
    full = (STORAGE_ROOT / relative_key).resolve()
    if not str(full).startswith(str(STORAGE_ROOT) + os.sep) and full != STORAGE_ROOT:
        raise HTTPException(status_code=400, detail="key khong hop le (path traversal?).")
    return full


def _check_auth(x_internal_token: str | None) -> None:
    if x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(status_code=401, detail="Thieu hoac sai internal token.")


@app.get("/internal/health")
def health():
    return {"status": "ok"}


@app.post("/internal/convert")
def convert(req: ConvertRequest, x_internal_token: str | None = Header(default=None)):
    _check_auth(x_internal_token)

    source_path = _resolve_safe(req.source_key)
    output_dir = _resolve_safe(req.output_key)

    try:
        manifest = convert_pdf(
            source_path=source_path,
            output_dir=output_dir,
            pipeline_version=req.pipeline_version,
            password=req.password,
        )
        return {"status": "ok", "manifest": manifest}
    except ConversionError as e:
        return {"status": "error", "reason": e.reason, "message": e.message}
