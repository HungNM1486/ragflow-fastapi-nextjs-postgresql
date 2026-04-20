#!/usr/bin/env python3
"""
Đo thời gian thực tế gọi RAGFlow (không qua FastAPI).
Đọc biến môi trường từ backend/.env nếu có.

Chạy:
  cd /path/to/ragflow_legal
  ./backend/.venv/bin/python scripts/measure_ragflow_latency.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / "backend" / ".env")

    base = os.environ.get("RAGFLOW_BASE_URL", "http://127.0.0.1:19380").rstrip("/")
    key = os.environ.get("RAGFLOW_API_KEY", "")
    chat_id = os.environ.get("RAGFLOW_CHAT_ID", "")
    if not key or not chat_id:
        print("Thiếu RAGFLOW_API_KEY hoặc RAGFLOW_CHAT_ID trong backend/.env", file=sys.stderr)
        return 1

    try:
        import httpx
    except ImportError:
        print("Cần httpx (đã có trong backend/.venv): dùng backend/.venv/bin/python", file=sys.stderr)
        return 1

    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    q = os.environ.get(
        "BENCH_QUESTION",
        "Đối tượng áp dụng của QUYẾT ĐỊNH 16/2026/QĐ-TTg",
    )

    print(f"RAGFLOW_BASE_URL={base}")
    print(f"CHAT_ID={chat_id[:8]}…")
    print(f"question={q[:80]}{'…' if len(q) > 80 else ''}\n")

    # --- Tạo session ---
    t0 = time.perf_counter()
    with httpx.Client(timeout=120.0) as http:
        s = http.post(
            f"{base}/api/v1/chats/{chat_id}/sessions",
            headers=headers,
            json={"name": "latency-bench", "user_id": "bench-latency-user"},
        )
    t1 = time.perf_counter()
    print(f"1) POST …/sessions           HTTP {s.status_code}  wall={1000 * (t1 - t0):.1f} ms")
    if s.status_code != 200:
        print(s.text[:500], file=sys.stderr)
        return 1
    sid = s.json().get("data", {}).get("id")
    if not sid:
        print("Không có session id", file=sys.stderr)
        return 1

    # --- completions non-stream (toàn bộ retrieval+LLM trong một HTTP) ---
    t2 = time.perf_counter()
    with httpx.Client(timeout=httpx.Timeout(600.0, connect=30.0)) as http:
        r = http.post(
            f"{base}/api/v1/chats/{chat_id}/completions",
            headers=headers,
            json={"question": q, "stream": False, "session_id": sid},
        )
    t3 = time.perf_counter()
    print(f"2) POST …/completions (sync) HTTP {r.status_code}  wall={1000 * (t3 - t2):.1f} ms  ← chủ yếu là RAGFlow")
    if r.status_code == 200:
        try:
            body = r.json()
            ans = (body.get("data") or {}).get("answer")
            if isinstance(ans, str):
                print(f"   answer_len={len(ans)}")
        except json.JSONDecodeError:
            pass

    # --- completions stream: TTFB vs tổng đọc body ---
    t4 = time.perf_counter()
    first_at: float | None = None
    nbytes = 0
    with httpx.Client(timeout=httpx.Timeout(600.0, connect=30.0)) as http:
        with http.stream(
            "POST",
            f"{base}/api/v1/chats/{chat_id}/completions",
            headers=headers,
            json={"question": q, "stream": True, "session_id": sid},
        ) as resp:
            print(f"3) POST …/completions (SSE)  HTTP {resp.status_code}")
            if resp.status_code != 200:
                print(resp.read().decode("utf-8", errors="replace")[:500], file=sys.stderr)
                return 0
            for chunk in resp.iter_bytes():
                if chunk:
                    nbytes += len(chunk)
                    if first_at is None:
                        first_at = time.perf_counter()
    t5 = time.perf_counter()
    ttfb_ms = 1000 * (first_at - t4) if first_at else -1.0
    total_ms = 1000 * (t5 - t4)
    after_first_ms = 1000 * (t5 - first_at) if first_at else total_ms
    print(f"   TTFB (byte đầu từ upstream) = {ttfb_ms:.1f} ms")
    print(f"   Sau TTFB đến hết stream   = {after_first_ms:.1f} ms")
    print(f"   Tổng HTTP stream           = {total_ms:.1f} ms  bytes={nbytes}")

    print(
        "\nGợi ý đọc thêm: bật LOG (uvicorn) mức INFO khi gọi qua FastAPI — "
        "backend đã log dòng `chat_latency` (prepare / ragflow / persist)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
