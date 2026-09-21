"""One disposable OS process per document; never import PDFium in the web server."""
import json
import os
import pathlib
import resource
import sys


def main():
    memory = int(os.getenv("PDF_PROCESS_MEMORY_MB", "512")) * 1024 * 1024
    cpu = int(os.getenv("PDF_TIMEOUT_SECONDS", "600"))
    resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    resource.setrlimit(resource.RLIMIT_FSIZE, (256 * 1024 * 1024, 256 * 1024 * 1024))
    from .convert import ConversionError, convert_pdf
    req = json.load(sys.stdin)
    try:
        result = {"status": "ok", "manifest": convert_pdf(
            pathlib.Path(req["source"]), pathlib.Path(req["output"]),
            req["pipeline_version"], req.get("password"))}
    except ConversionError as exc:
        result = {"status": "error", "reason": exc.reason, "message": exc.message}
    except MemoryError:
        result = {"status": "error", "reason": "resource_limit", "message": "PDF vuot gioi han bo nho."}
    pathlib.Path(req["result"]).write_text(json.dumps(result), encoding="utf-8")


if __name__ == "__main__":
    main()
