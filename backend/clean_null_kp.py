"""清理 questions.knowledge_points 字段中的 null 元素

功能：扫描所有题目，将 knowledge_points 数组中的 null 元素过滤掉，并写回数据库
使用场景：清理因 null 元素导致校对工作台崩溃的脏数据
"""
import sqlite3
import json

DB_PATH = "data/schoolwork.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 1. 找出所有 knowledge_points 包含 null 的题目
cur.execute('SELECT id, question_no, knowledge_points FROM questions WHERE knowledge_points IS NOT NULL')
rows = cur.fetchall()

dirty_ids = []
for row in rows:
    kps = row['knowledge_points']
    try:
        arr = json.loads(kps) if isinstance(kps, str) else kps
        if any(x is None for x in arr):
            dirty_ids.append((row['id'], row['question_no'], arr))
    except Exception:
        pass

print(f'找到 {len(dirty_ids)} 道脏数据题目：')
for qid, qno, arr in dirty_ids:
    print(f'  Q{qno} (id={qid}) kp={arr}')

# 2. 过滤 null 后写回
fixed = 0
for qid, qno, arr in dirty_ids:
    cleaned = [x for x in arr if x is not None]
    cur.execute('UPDATE questions SET knowledge_points = ? WHERE id = ?', (json.dumps(cleaned, ensure_ascii=False), qid))
    fixed += 1
    print(f'  Q{qno} 清理后 kp={cleaned}')

conn.commit()
print(f'清理完成，共修复 {fixed} 道题')
conn.close()
