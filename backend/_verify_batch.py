"""
直接调用 batch_auto_ai 并以长 timeout 等待
"""
import json
import time
from urllib import request, error


BASE = "http://localhost:8000"


def log(msg: str) -> None:
    print(msg, flush=True)


def req(method, path, token=None, body=None, timeout=600):
    url = f"{BASE}{path}"
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(r, timeout=timeout) as resp:
            txt = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(txt) if txt else None
    except error.HTTPError as e:
        txt = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt
    except Exception as e:
        return -1, str(e)


def main():
    try:
        with open("f:/tools4/backend/token.txt", "r", encoding="utf-8") as f:
            token = f.read().strip()
    except Exception:
        token = None
    if not token:
        log("[FAIL] 无 token")
        return

    paper_id = "a739f7b0-8159-4500-ab16-e9465ac71df6"
    log(f"=== 直接调用 batch_auto_ai (paper_id={paper_id}) ===")
    t0 = time.time()
    status, result = req("POST", "/api/questions/batch-auto-ai", token=token, body={"paper_id": paper_id}, timeout=600)
    log(f"-> {status} (耗时 {time.time() - t0:.1f}s)")
    log(json.dumps(result, ensure_ascii=False, indent=2)[:5000])


if __name__ == "__main__":
    main()
