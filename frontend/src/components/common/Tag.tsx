// 功能：通用标签，支持不同颜色变体和关闭按钮
// 输入参数：children, variant, onClose, className
// 返回值：标签 JSX
// 使用场景：知识点标签、题型标签、筛选标签
import { X } from 'lucide-react';

// 标签颜色变体类型
type TagVariant = 'default' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'cyan' | 'amber' | 'indigo';

interface TagProps {
  children: React.ReactNode;
  variant?: TagVariant;
  onClose?: () => void;
  className?: string;
}

// 各变体对应的样式映射
const variantClasses: Record<TagVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  purple: 'bg-purple-100 text-purple-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  amber: 'bg-amber-100 text-amber-700',
  indigo: 'bg-indigo-100 text-indigo-700',
};

export default function Tag({ children, variant = 'default', onClose, className = '' }: TagProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md ${variantClasses[variant]} ${className}`}>
      {children}
      {/* 关闭按钮：传入 onClose 时显示 */}
      {onClose && (
        <button onClick={onClose} className="ml-0.5 hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
