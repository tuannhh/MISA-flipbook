"""Internal supervisor: bounded admission, isolated parser, kill AND reap on timeout."""
from __future__ import annotations
import asyncio
import hmac
import json
import os
import pathlib
import shutil
import sys
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

STORAGE_ROOT = pathlib.Path(os.environ["STORAGE_ROOT"]).resolve()
INTERNAL_API_TOKEN = os.environ["INTERNAL_API_TOKEN"]
TIMEOUT_SECONDS = int(os.getenv("PDF_TIMEOUT_SECONDS", "600"))
MAX_PROCESSES = int(os.getenv("PDF_MAX_PROCESSES", "1"))
if TIMEOUT_SECONDS < 1 or MAX_PROCESSES < 1:
    raise ValueError("PDF limits must be positive")
slots = asyncio.Semaphore(MAX_PROCESSES)
app = FastAPI(title="MISA Flipbook PDF Worker (internal)")

class ConvertRequest(BaseModel):
    source_key: str
    output_key: str
    pipeline_version: str
    password: str | None = None

def _resolve_safe(key: str) -> pathlib.Path:
    full = (STORAGE_ROOT / key).resolve()
    if full == STORAGE_ROOT or not full.is_relative_to(STORAGE_ROOT):
        raise HTTPException(400, "key khong hop le.")
    return full

async def run_child(payload: dict, timeout: float):
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "app.runner", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        await asyncio.wait_for(process.communicate(json.dumps(payload).encode()), timeout)
        return process.returncode
    finally:
        if process.returncode is None:
            process.kill()
        await process.wait()

@app.get("/internal/health")
async def health():
    return {"status": "ok"}

@app.post("/internal/convert")
async def convert(req: ConvertRequest, x_internal_token: str | None = Header(default=None)):
    if not hmac.compare_digest(x_internal_token or "", INTERNAL_API_TOKEN):
        raise HTTPException(401, "Thieu hoac sai internal token.")
    source = _resolve_safe(req.source_key)
    output = _resolve_safe(req.output_key)
    if not source.is_file() or source.is_relative_to(output):
        raise HTTPException(400, "Source/output khong hop le.")
    if slots.locked():
        raise HTTPException(503, "PDF worker dang ban.", headers={"Retry-After": "5"})
    async with slots:
        try:
            output.mkdir(parents=True, exist_ok=False)
        except FileExistsError:
            raise HTTPException(409, "Output cua lan xu ly nay da ton tai.")
        result_path = output / "result.json"
        success = False
        try:
            code = await run_child({"source": str(source), "output": str(output),
                                    "result": str(result_path), "pipeline_version": req.pipeline_version,
                                    "password": req.password}, TIMEOUT_SECONDS)
            if code != 0 or not result_path.exists():
                return {"status": "error", "reason": "parser_failed",
                        "message": "PDF khong the xu ly trong gioi han tai nguyen."}
            if result_path.stat().st_size > 16 * 1024 * 1024:
                return {"status": "error", "reason": "resource_limit", "message": "Manifest qua lon."}
            result = json.loads(result_path.read_text(encoding="utf-8"))
            success = result.get("status") == "ok"
            result_path.unlink()
            return result
        except asyncio.TimeoutError:
            return {"status": "error", "reason": "timeout", "message": "PDF xu ly qua thoi gian cho phep."}
        finally:
            # This attempt directory was created exclusively above; child is reaped.
            if not success:
                shutil.rmtree(output, ignore_errors=True)
