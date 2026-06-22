/**
 * EngineConfigPanel — 解析引擎配置面板组件（二期优化：移除分题方案选择）
 * 功能：选择核心引擎、设置页码范围
 * 输入：config 当前配置，onChange 配置变更回调
 * 返回：引擎配置面板 JSX
 * 使用场景：PaperUploadPage 左侧配置区（阶段一：MinerU云端解析）
 *
 * 注意：MinerU 云端解析自动处理公式/表格/图形裁切，无需额外开关
 *       分题方案选择已移至 PaperSplitPage（阶段二）
 */
import { Cpu } from "lucide-react"

/** 解析配置类型 */
export interface ParseConfig {
  engine: 'mineru'                     // 核心引擎：仅MinerU云端
  page_range_start: number | null  // 起始页码
  page_range_end: number | null    // 结束页码
}

/** 组件属性 */
interface EngineConfigPanelProps {
  config: ParseConfig                              // 当前配置
  onChange: (config: ParseConfig) => void          // 配置变更回调
  splitLoading?: boolean                           // 分题加载中（已废弃，保留兼容）
  activeSplitMethod?: number | null                // 当前激活的分题方案（已废弃，保留兼容）
}

/** 引擎配置面板 */
export default function EngineConfigPanel({
  config,
  onChange,
}: EngineConfigPanelProps) {
  /** 更新配置中的单个字段 */
  const updateConfig = <K extends keyof ParseConfig>(key: K, value: ParseConfig[K]) => {
    onChange({ ...config, [key]: value })
  }

  /** 处理页码输入，转为数字或 null */
  const handlePageInput = (
    key: 'page_range_start' | 'page_range_end',
    value: string
  ) => {
    const num = value === '' ? null : parseInt(value, 10)
    if (value !== '' && isNaN(num as number)) return
    updateConfig(key, num as number | null)
  }

  return (
    <div className="space-y-4">
      {/* 引擎信息 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2">
          <Cpu size={14} />
          解析引擎
        </label>
        <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50">
          <span className="text-sm font-medium text-slate-700">MinerU 云端解析</span>
          <p className="text-xs text-slate-400 mt-0.5">高精度，支持 LaTeX/HTML/Word/Markdown 输出，自动识别公式/表格/图形</p>
        </div>
      </div>

      {/* 页码范围区域 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2">
          页码范围（选填）
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            placeholder="起始页"
            value={config.page_range_start ?? ''}
            onChange={(e) => handlePageInput('page_range_start', e.target.value)}
            className="w-24 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
          />
          <span className="text-sm text-slate-400">—</span>
          <input
            type="number"
            min={1}
            placeholder="结束页"
            value={config.page_range_end ?? ''}
            onChange={(e) => handlePageInput('page_range_end', e.target.value)}
            className="w-24 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-slate-400">留空则解析全部</span>
        </div>
      </div>
    </div>
  )
}