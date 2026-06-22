// 功能：带搜索图标的输入框，支持防抖和清空
// 输入参数：value, onChange, placeholder, debounceMs
// 返回值：搜索框 JSX
// 使用场景：题库页搜索、知识点搜索
import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export default function SearchInput({ value, onChange, placeholder = "搜索...", debounceMs = 300 }: SearchInputProps) {
  // 本地输入值，用于防抖
  const [localValue, setLocalValue] = useState(value);

  // 防抖：延迟触发外部 onChange
  useEffect(() => {
    const timer = setTimeout(() => onChange(localValue), debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange]);

  // 外部 value 变化时同步本地值
  useEffect(() => { setLocalValue(value); }, [value]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {/* 清空按钮：有内容时显示 */}
      {localValue && (
        <button onClick={() => { setLocalValue(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2">
          <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
        </button>
      )}
    </div>
  );
}
