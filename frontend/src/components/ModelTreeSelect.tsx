/**
 * ModelTreeSelect — 按供应商分组的模型下拉选择器（参照 ragflow 的 ModelTreeSelect）
 * 功能：下拉框内按 provider_name 分组展示所有可选模型，支持搜索
 * 输入：modelTypes（允许的模型类型）、value、onChange、options（已添加模型列表）
 * 返回值：模型选择器 JSX
 * 使用场景：SystemSetting 中选择默认模型
 */
import { useMemo, useState, useRef, useEffect } from "react"
import { ChevronDown, X, Search, Check } from "lucide-react"
import { cn } from "@/utils/cn"

/** 模型选项 */
export type ModelOption = {
  provider_name: string
  instance_name: string
  model_name: string
  model_type: string
  status: string
}

interface ModelTreeSelectProps {
  /** 允许的模型类型（白名单） */
  modelTypes: string[]
  /** 当前选中的值（格式：provider|instance|model） */
  value?: string
  /** 选中回调 */
  onChange: (value: string) => void
  /** 占位符 */
  placeholder?: string
  /** 是否显示搜索框 */
  showSearch?: boolean
  /** 是否允许清空（llm_id 不允许） */
  allowClear?: boolean
  /** 可选模型列表 */
  options: ModelOption[]
}

export function ModelTreeSelect({
  modelTypes,
  value,
  onChange,
  placeholder = "请选择模型",
  showSearch = true,
  allowClear = true,
  options,
}: ModelTreeSelectProps) {
  // 展开状态
  const [open, setOpen] = useState(false)
  // 搜索关键词
  const [search, setSearch] = useState("")
  // 容器引用（点击外部关闭）
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  // 按供应商分组
  const groupedOptions = useMemo(() => {
    // 过滤出符合 modelTypes 的 active 模型
    const filtered = options.filter(
      (o) => modelTypes.includes(o.model_type) && o.status === "active"
    )

    // 按 provider_name + instance_name 分组
    const groups: Record<string, ModelOption[]> = {}
    for (const opt of filtered) {
      const key = `${opt.provider_name} / ${opt.instance_name}`
      if (!groups[key]) groups[key] = []
      groups[key].push(opt)
    }

    // 搜索过滤
    if (search) {
      const lower = search.toLowerCase()
      const filteredGroups: Record<string, ModelOption[]> = {}
      for (const [key, items] of Object.entries(groups)) {
        const matched = items.filter(
          (item) =>
            item.model_name.toLowerCase().includes(lower) ||
            item.provider_name.toLowerCase().includes(lower) ||
            item.instance_name.toLowerCase().includes(lower)
        )
        if (matched.length > 0) {
          filteredGroups[key] = matched
        }
      }
      return filteredGroups
    }

    return groups
  }, [options, modelTypes, search])

  // 当前选中值解析
  const selectedValue = useMemo(() => {
    if (!value) return null
    const [provider, instance, model] = value.split("|")
    return { provider, instance, model }
  }, [value])

  // 显示文本
  const displayText = useMemo(() => {
    if (!selectedValue) return ""
    return `${selectedValue.provider} / ${selectedValue.instance} / ${selectedValue.model}`
  }, [selectedValue])

  /** 选择模型 */
  function handleSelect(opt: ModelOption) {
    onChange(`${opt.provider_name}|${opt.instance_name}|${opt.model_name}`)
    setOpen(false)
    setSearch("")
  }

  /** 清空 */
  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange("")
  }

  const hasOptions = Object.keys(groupedOptions).length > 0

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full px-3 py-2 text-sm text-left border border-slate-200 rounded-lg bg-white",
          "flex items-center justify-between",
          "hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500",
          "transition-colors"
        )}
      >
        <span className={cn("truncate", !displayText && "text-slate-400")}>
          {displayText || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {displayText && allowClear && (
            <X
              size={14}
              className="text-slate-400 hover:text-slate-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown size={14} className={cn("text-slate-400 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {/* 搜索框 */}
          {showSearch && (
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* 分组列表 */}
          <div className="max-h-80 overflow-y-auto">
            {!hasOptions ? (
              <div className="p-4 text-center text-sm text-slate-400">
                暂无可选模型，请先添加供应商
              </div>
            ) : (
              Object.entries(groupedOptions).map(([groupKey, items]) => (
                <div key={groupKey} className="border-b border-slate-100 last:border-b-0">
                  {/* 分组标题 */}
                  <div className="px-3 py-1.5 text-xs text-slate-500 bg-slate-50 font-medium">
                    {groupKey}
                  </div>
                  {/* 模型项 */}
                  {items.map((item) => {
                    const itemValue = `${item.provider_name}|${item.instance_name}|${item.model_name}`
                    const isSelected = value === itemValue
                    return (
                      <div
                        key={itemValue}
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer",
                          "hover:bg-slate-50 transition-colors",
                          isSelected && "bg-blue-50"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">✦</span>
                          <span className="text-slate-700">{item.model_name}</span>
                        </div>
                        {isSelected && <Check size={14} className="text-blue-500" />}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}