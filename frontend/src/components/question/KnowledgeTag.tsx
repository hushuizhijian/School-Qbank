// 功能：展示单个知识点标签，带颜色和删除按钮
// 输入参数：name, code, level, onRemove
// 返回值：知识点标签 JSX
// 使用场景：题目卡片、编辑器中的知识点展示
import { X } from 'lucide-react';

// 根据层级返回不同颜色样式
const levelColors: Record<number, string> = {
  1: 'bg-slate-100 text-slate-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-green-100 text-green-700',
  4: 'bg-purple-100 text-purple-700',
  5: 'bg-amber-100 text-amber-700',
};

interface KnowledgeTagProps {
  name: string;
  code?: string;
  level?: number;
  onRemove?: () => void;
}

export default function KnowledgeTag({ name, code, level = 5, onRemove }: KnowledgeTagProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md ${levelColors[level] || levelColors[5]}`}>
      {/* 知识点名称 */}
      {name}
      {/* 删除按钮：传入 onRemove 时显示 */}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
