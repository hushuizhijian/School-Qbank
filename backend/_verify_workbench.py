"""
验证校对工作台后端补全能力
"""
import json
import sys
import time
from urllib import request, error


BASE = "http://localhost:8000"


def log(msg: str) -> None:
    """带 flush 的日志输出，避免管道缓冲"""
    print(msg, flush=True)


def req(method, path, token=None, body=None, timeout=120):
    """统一的 HTTP 请求封装"""
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
    # 1) 登录 — 尝试 admin / 多种密码
    login_candidates = [
        {"username": "admin", "password": "admin"},
        {"username": "admin", "password": "admin123"},
        {"username": "admin", "password": "password"},
        {"username": "admin", "password": "123456"},
    ]

    token = None
    for body in login_candidates:
        status, payload = req("POST", "/api/auth/login", body=body)
        if status == 200 and isinstance(payload, dict) and payload.get("access_token"):
            token = payload["access_token"]
            log(f"[OK] 登录成功：{body['username']} / {body['password']}")
            break
        log(f"[WARN] 登录失败 {status}: {body['username']}/{body['password']} -> {str(payload)[:200]}")

    if not token:
        # 尝试从已有 token 文件读取
        for tf in ["f:/tools4/backend/token.txt"]:
            try:
                with open(tf, "r", encoding="utf-8") as f:
                    token = f.read().strip()
                if token:
                    log(f"[OK] 使用 token 文件: {tf}")
                    break
            except Exception:
                pass

    if not token:
        log("[FAIL] 无法获取 token，退出")
        return

    # 2) 获取试卷列表
    log("\n=== Step 2: 列出试卷 ===")
    status, papers_resp = req("GET", "/api/papers?limit=5", token=token)
    log(f"GET /api/papers?limit=5 -> {status}")
    if status != 200 or not isinstance(papers_resp, dict):
        log(f"响应: {str(papers_resp)[:500]}")
        return
    papers = papers_resp.get("papers", [])
    log(f"试卷数: {len(papers)}")
    for p in papers[:3]:
        log(f"  - {p.get('id')} | {p.get('filename')} | {p.get('subject')}")

    if not papers:
        log("没有试卷，跳过")
        return

    paper_id = papers[0]["id"]

    # 3) 拉取当前题目
    log(f"\n=== Step 3: 拉取题目 (paper_id={paper_id}) ===")
    status, questions = req("GET", f"/api/questions/by-paper/{paper_id}", token=token)
    log(f"GET /api/questions/paper/{paper_id} -> {status}")
    if status != 200 or not isinstance(questions, list):
        log(f"响应: {str(questions)[:500]}")
        return
    log(f"题目数: {len(questions)}")

    # 统计已有 ai_difficulty / user_difficulty / knowledge_points 的题目
    ai_difficulty_count = sum(1 for q in questions if q.get("ai_difficulty") is not None)
    user_difficulty_count = sum(1 for q in questions if q.get("user_difficulty") is not None)
    kp_count = sum(1 for q in questions if q.get("knowledge_points") and len(q.get("knowledge_points")) > 0)

    log(f"  已标 ai_difficulty: {ai_difficulty_count}/{len(questions)}")
    log(f"  已标 user_difficulty: {user_difficulty_count}/{len(questions)}")
    log(f"  已绑定知识点: {kp_count}/{len(questions)}")

    # 打印第一道题的字段样例
    if questions:
        sample = questions[0]
        log("\n[样例] 第一道题目关键字段：")
        for k in ["id", "ai_difficulty", "user_difficulty", "knowledge_points", "question_type", "in_bank"]:
            v = sample.get(k)
            if isinstance(v, str) and len(v) > 80:
                v = v[:80] + "..."
            log(f"  {k} = {v}")

    # 4) 调用 batch-auto-ai
    log(f"\n=== Step 4: 调用 batch-auto-ai ===")
    t0 = time.time()
    status, result = req("POST", f"/api/questions/batch-auto-ai", token=token, body={"paper_id": paper_id}, timeout=300)
    log(f"POST /api/questions/batch-auto-ai/{paper_id} -> {status} (耗时 {time.time() - t0:.1f}s)")
    log(f"响应: {json.dumps(result, ensure_ascii=False, indent=2)[:3000]}")

    # 5) 再次拉取题目，验证是否补全
    log(f"\n=== Step 5: 重新拉取题目验证补全 ===")
    time.sleep(1)
    status, questions2 = req("GET", f"/api/questions/by-paper/{paper_id}", token=token)
    if status != 200 or not isinstance(questions2, list):
        log(f"响应: {str(questions2)[:500]}")
        return

    ai_difficulty_count2 = sum(1 for q in questions2 if q.get("ai_difficulty") is not None)
    user_difficulty_count2 = sum(1 for q in questions2 if q.get("user_difficulty") is not None)
    kp_count2 = sum(1 for q in questions2 if q.get("knowledge_points") and len(q.get("knowledge_points")) > 0)

    log(f"  已标 ai_difficulty: {ai_difficulty_count2}/{len(questions2)}  (Δ +{ai_difficulty_count2 - ai_difficulty_count})")
    log(f"  已标 user_difficulty: {user_difficulty_count2}/{len(questions2)}  (Δ +{user_difficulty_count2 - user_difficulty_count})")
    log(f"  已绑定知识点: {kp_count2}/{len(questions2)}  (Δ +{kp_count2 - kp_count})")

    # 抽三道题看看具体数值
    log("\n[样例] 补全后前 3 道题：")
    for i, q in enumerate(questions2[:3]):
        kps = q.get("knowledge_points") or []
        kp_names = [k.get("name") for k in kps] if kps else []
        log(f"  [{i+1}] ai_difficulty={q.get('ai_difficulty')}, user_difficulty={q.get('user_difficulty')}, kp={kp_names}")


if __name__ == "__main__":
    main()
