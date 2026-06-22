// 功能：数字徽章或状态标签
// 输入参数：count, variant, size
// 返回值：徽章 JSX
// 使用场景：知识点节点题目数、未读消息数

// 徽章颜色变体类型
type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

// 徽章尺寸类型
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  count?: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  children?: React.ReactNode;
}

// 各变体对应的样式映射
const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-600',
  primary: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
};

export default function Badge({ count, variant = 'default', size = 'sm', children }: BadgeProps) {
  // 根据尺寸选择样式
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span className={`inline-flex items-center justify-center font-medium rounded-full ${variantClasses[variant]} ${sizeClasses}`}>
      {/* 优先显示数字，否则显示子内容 */}
      {count !== undefined ? count : children}
    </span>
  );
}
