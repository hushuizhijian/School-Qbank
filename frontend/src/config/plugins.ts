/**
 * 校对工作台插件注册清单
 *
 * 功能：静态声明所有可降级插件，核心按此清单加载
 * 使用场景：PluginSlot 组件引用，动态 import 插件组件
 */

import type { PluginRegistration } from "@/types/plugin"

/* ========== 插件清单 ========== */

export const WORKBENCH_PLUGINS: PluginRegistration[] = [
  {
    meta: {
      id: "ai-auto-difficulty",
      mountPoint: "attribute-panel",
      priority: 10,
      label: "AI 难度打分",
    },
    loader: () => import("@/components/plugins/wrappers/AiAutoDifficultyWrapper"),
  },
  {
    meta: {
      id: "ai-match-knowledge",
      mountPoint: "attribute-panel",
      priority: 20,
      label: "AI 知识点匹配",
    },
    loader: () => import("@/components/plugins/wrappers/AiMatchKnowledgeWrapper"),
  },
  {
    meta: {
      id: "ai-generate-analysis",
      mountPoint: "editor-bottom",
      priority: 10,
      label: "AI 生成解析",
    },
    loader: () => import("@/components/plugins/wrappers/AiGenerateAnalysisWrapper"),
  },
  {
    meta: {
      id: "ai-split-sub-questions",
      mountPoint: "editor-bottom",
      priority: 20,
      label: "AI 拆分子题",
    },
    loader: () => import("@/components/plugins/wrappers/AiSplitSubQuestionsWrapper"),
  },
  {
    meta: {
      id: "ai-fix-typos",
      mountPoint: "editor-side",
      priority: 10,
      label: "AI 修正错别字",
    },
    loader: () => import("@/components/plugins/wrappers/AiFixTyposWrapper"),
  },
  {
    meta: {
      id: "ai-standardize-stem",
      mountPoint: "editor-side",
      priority: 20,
      label: "AI 标准化题干",
    },
    loader: () => import("@/components/plugins/wrappers/AiStandardizeStemWrapper"),
  },
  {
    meta: {
      id: "ai-batch-standardize",
      mountPoint: "toolbar",
      priority: 10,
      label: "AI 批量标准化",
    },
    loader: () => import("@/components/plugins/wrappers/AiBatchStandardizeWrapper"),
  },
  {
    meta: {
      id: "quality-checker",
      mountPoint: "toolbar",
      priority: 20,
      label: "质量检查",
    },
    loader: () => import("@/components/plugins/wrappers/QualityCheckerWrapper"),
  },
]