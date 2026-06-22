"""
数学知识树预设数据（兼容层）

功能：保留旧变量名 PRESET_BNUP_PRIMARY_MATH，重定向到模块化版本
  - 旧版：北师大版小学数学（按「年级→学期→单元→课时」组织）—— 已废弃
  - 新版：模块化数学知识树（按「模块（4 大领域）→ 子主题 → 知识点」组织）—— 推荐
输入参数：无
返回值：PRESET_BNUP_PRIMARY_MATH 字典
使用场景：初始化数学知识树（系统设置 → 知识树管理）
"""
from app.services.preset_module_based_math import (
    PRESET_MODULE_BASED_MATH,
    PRESET_KNOWLEDGE_TREE,
)

# 兼容旧变量名（指向模块化版本）
PRESET_BNUP_PRIMARY_MATH = PRESET_MODULE_BASED_MATH
