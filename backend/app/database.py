"""
数据库引擎与会话管理模块

功能：创建异步数据库引擎、会话工厂、声明式基类，提供数据库初始化和自动迁移
输入参数：从 app.config 读取数据库连接配置
返回值：engine（引擎）、async_session（会话工厂）、Base（基类）、get_db（依赖注入）、init_db（初始化函数）
使用场景：所有模型继承 Base，所有 API 通过 Depends(get_db) 获取数据库会话
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# 异步数据库引擎
engine = create_async_engine(
    settings.database_url,  # 数据库连接地址
    echo=settings.debug,  # 调试模式输出SQL
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},  # SQLite线程安全配置
)

# 异步会话工厂
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """声明式基类，所有模型继承此类"""
    pass


async def get_db() -> AsyncSession:
    """
    获取数据库会话（依赖注入用）

    功能：创建异步数据库会话，请求结束后自动关闭
    输入参数：无
    返回值：AsyncSession 实例（通过 yield）
    使用场景：FastAPI 路由中通过 Depends(get_db) 注入
    """
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """
    初始化数据库

    功能：创建所有表 + 自动迁移新字段 + 导入预设数据
    输入参数：无
    返回值：无
    使用场景：应用启动时通过 lifespan 调用
    """
    # 创建所有表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 自动迁移：为已有表添加新字段（SQLite ALTER TABLE）
    async with engine.begin() as conn:
        # papers 表添加 region 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE papers ADD COLUMN region VARCHAR(50) DEFAULT NULL"
                )
            )
        except Exception:
            pass  # 字段已存在则忽略

        # papers 表添加 paper_type 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE papers ADD COLUMN paper_type VARCHAR(30) DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # papers 表添加 academic_year 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE papers ADD COLUMN academic_year VARCHAR(10) DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # papers 表添加 version 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE papers ADD COLUMN version VARCHAR(30) DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # papers 表添加 parse_config 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE papers ADD COLUMN parse_config TEXT DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # papers 表添加 parse_stage 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE papers ADD COLUMN parse_stage VARCHAR(30) DEFAULT ''"
                )
            )
        except Exception:
            pass

        # papers 表添加 parse_progress 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE papers ADD COLUMN parse_progress TEXT DEFAULT '{}'"
                )
            )
        except Exception:
            pass

        # questions 表添加 analysis 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN analysis TEXT DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 score 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN score FLOAT DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 source_paper_name 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN source_paper_name VARCHAR(255) DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 source_year 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN source_year VARCHAR(10) DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 source_region 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN source_region VARCHAR(50) DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 has_figure 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN has_figure BOOLEAN DEFAULT 0"
                )
            )
        except Exception:
            pass

        # questions 表添加 has_formula 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN has_formula BOOLEAN DEFAULT 0"
                )
            )
        except Exception:
            pass

        # questions 表添加 has_table 字段（V2新增）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN has_table BOOLEAN DEFAULT 0"
                )
            )
        except Exception:
            pass

        # questions 表添加 tikz_code 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN tikz_code TEXT DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 figure_type 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN figure_type VARCHAR(20) DEFAULT 'screenshot'"
                )
            )
        except Exception:
            pass

        # questions 表添加 in_bank 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN in_bank BOOLEAN DEFAULT 0"
                )
            )
        except Exception:
            pass

        # questions 表添加 bank_added_at 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN bank_added_at TIMESTAMP DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 question_status 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN question_status VARCHAR(20) DEFAULT 'pending'"
                )
            )
        except Exception:
            pass

        # questions 表添加 is_favorite 字段
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN is_favorite BOOLEAN DEFAULT 0"
                )
            )
        except Exception:
            pass

        # questions 表添加 ai_difficulty 字段（V2新增，0.1~1.0 小数）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN ai_difficulty FLOAT DEFAULT NULL"
                )
            )
        except Exception:
            pass

        # questions 表添加 user_difficulty 字段（V2新增，0.1~1.0 小数）
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE questions ADD COLUMN user_difficulty FLOAT DEFAULT NULL"
                )
            )
        except Exception:
            pass

    # 自动导入预设知识点
    # 三种情况处理：
    #   1) 表为空（count == 0）→ 首次启动，导入预设
    #   2) 表中已是旧版结构（4 大模块）→ 自动迁移为新版本（年级→学期→单元→知识点）
    #   3) 表中已是新版结构（≥ 预设规模 80%）→ 跳过（保留用户可能的手动编辑）
    try:
        from app.services.knowledge_service import import_tree
        from app.services.preset_knowledge import PRESET_BNUP_PRIMARY_MATH
        from app.models.knowledge_point import KnowledgePoint
        from sqlalchemy import select as sa_select, func as sa_func, delete as sa_delete

        # 识别旧版 4 大模块结构（关键词匹配）
        LEGACY_MODULE_KEYWORDS = {"数与代数", "图形与几何", "统计与概率", "综合与实践"}

        def _count_preset_nodes(nodes: list[dict]) -> int:
            """递归统计预设数据总节点数"""
            cnt = len(nodes)
            for n in nodes:
                cnt += _count_preset_nodes(n.get("children", []))
            return cnt

        async with async_session() as db:
            # 查询所有数学学科顶级节点（parent_id 为空的节点）
            top_q = sa_select(KnowledgePoint).where(
                KnowledgePoint.subject == "数学",
                KnowledgePoint.parent_id.is_(None),
            )
            top_result = await db.execute(top_q)
            top_nodes = top_result.scalars().all()
            top_names = {n.name for n in top_nodes}

            # 查询数学学科总节点数
            count_q = sa_select(sa_func.count()).select_from(KnowledgePoint).where(
                KnowledgePoint.subject == "数学"
            )
            count_result = await db.execute(count_q)
            current_count = count_result.scalar() or 0

            # 计算预设数据总规模
            preset_tree = PRESET_BNUP_PRIMARY_MATH.get("数学", [])
            preset_count = _count_preset_nodes(preset_tree)

            # 决策：是否需要重新加载预设
            is_legacy_structure = (
                len(top_nodes) == 4 and top_names == LEGACY_MODULE_KEYWORDS
            )  # 旧 4 大模块结构
            is_outdated = current_count < preset_count * 0.8  # 节点数明显少于预设

            if current_count == 0:
                # 情况 1：表为空 → 首次导入
                print("[预设] 知识点表为空，开始导入北师大版小学数学知识树")
                for subject, tree_data in PRESET_BNUP_PRIMARY_MATH.items():
                    try:
                        result = await import_tree(db, subject, tree_data)
                        print(f"[预设] 已导入 {subject} 知识树：{result['created_count']} 个节点")
                    except Exception as e:
                        print(f"[预设] 导入 {subject} 知识树失败：{e}")
            elif is_legacy_structure or is_outdated:
                # 情况 2：旧版结构或数据不完整 → 自动重新加载
                print(
                    f"[预设] 检测到旧版知识树结构（{current_count} 节点，"
                    f"顶级：{top_names}），自动迁移至新版本（{preset_count} 节点）"
                )
                # 先清空数学学科下所有节点
                await db.execute(
                    sa_delete(KnowledgePoint).where(KnowledgePoint.subject == "数学")
                )
                await db.commit()
                print("[预设] 已清空旧版数学知识点")
                # 重新导入
                try:
                    result = await import_tree(db, "数学", preset_tree)
                    print(f"[预设] 已迁移至新版本：{result['created_count']} 个节点")
                except Exception as e:
                    print(f"[预设] 迁移失败：{e}")
            else:
                # 情况 3：节点数合理 → 跳过
                print(
                    f"[预设] 数学学科已有 {current_count} 个节点（预设 {preset_count}），"
                    f"跳过自动加载"
                )
    except ImportError:
        print("[预设] 知识点服务模块尚未创建，跳过预设导入")

    # 自动导入预设AI服务商（表为空时）
    try:
        from app.models.ai_provider import AIProvider

        async with async_session() as db:
            from sqlalchemy import select as sa_select, func as sa_func
            count_result = await db.execute(sa_select(sa_func.count()).select_from(AIProvider))
            count = count_result.scalar() or 0

            if count == 0:
                from app.services.preset_ai_providers import PRESET_AI_PROVIDERS
                for preset in PRESET_AI_PROVIDERS:
                    p = AIProvider(
                        provider_name=preset["provider_name"],  # 服务商名称
                        api_base=preset["api_base"],  # API地址
                        api_key=preset["api_key"],  # API密钥
                        model_list=preset["model_list"],  # 模型列表
                        is_enabled=preset["is_enabled"],  # 是否启用
                    )
                    db.add(p)
                await db.commit()
                print(f"[预设] 已导入 {len(PRESET_AI_PROVIDERS)} 个AI服务商")
    except ImportError:
        print("[预设] AI服务商预设模块尚未创建，跳过预设导入")
