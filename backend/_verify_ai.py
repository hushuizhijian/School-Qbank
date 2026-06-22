"""
快速验证 AI 接口是否可达 — 单独测试 auto_difficulty 与 match_knowledge
"""
import json
import time
from urllib import request, error


BASE = "http://localhost:8000"


def log(msg: str) -> None:
    print(msg, flush=True)


def req(method, path, token=None, body=None, timeout=120):
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
    # 用现有 token
    try:
        with open("f:/tools4/backend/token.txt", "r", encoding="utf-8") as f:
            token = f.read().strip()
    except Exception:
        token = None
    if not token:
        log("[FAIL] 无 token")
        return

    # 拉取一份试卷的题目，找一道还没标 ai_difficulty 的题
    status, papers_resp = req("GET", "/api/papers?limit=5", token=token)
    if status != 200 or not isinstance(papers_resp, dict):
        log(f"[FAIL] 拉取试卷失败 {status}")
        return
    papers = papers_resp.get("papers", [])
    if not papers:
        log("[FAIL] 没有试卷")
        return

    paper_id = papers[0]["id"]
    log(f"使用试卷: {paper_id}")
    status, questions = req("GET", f"/api/questions/by-paper/{paper_id}", token=token)
    if status != 200 or not isinstance(questions, list):
        log(f"[FAIL] 拉题目 {status}: {str(questions)[:300]}")
        return
    log(f"题目数: {len(questions)}")

    # 找一道未标 ai_difficulty 的题
    target = next((q for q in questions if q.get("ai_difficulty") is None), None)
    if not target:
        log("所有题都已标 ai_difficulty，跳过测试")
        return

    log(f"\n=== 测试 auto_difficulty: question_id={target['id']} ===")
    log(f"题干: {(target.get('stem') or '')[:100]}...")
    t0 = time.time()
    status, result = req("POST", f"/api/questions/{target['id']}/auto-difficulty", token=token, body={}, timeout=60)
    log(f"POST /api/questions/{target['id']}/auto-difficulty -> {status} (耗时 {time.time() - t0:.1f}s)")
    log(f"响应: {json.dumps(result, ensure_ascii=False, indent=2)[:1500]}")

    # 测试 match_knowledge
    log(f"\n=== 测试 match_knowledge: question_id={target['id']} ===")
    t0 = time.time()
    status, result = req("POST", f"/api/questions/{target['id']}/match-knowledge", token=token, body={}, timeout=60)
    log(f"POST /api/questions/{target['id']}/match-knowledge -> {status} (耗时 {time.time() - t0:.1f}s)")
    log(f"响应: {json.dumps(result, ensure_ascii=False, indent=2)[:2000]}")


if __name__ == "__main__":
    main()
