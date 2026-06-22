// 功能：加载中旋转动画
// 输入参数：size, text
// 返回值：加载动画 JSX
// 使用场景：页面加载、数据请求中
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

// 各尺寸对应的样式
const sizeClasses = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };

export default function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-8">
      {/* 旋转加载图标 */}
      <Loader2 className={`animate-spin text-blue-500 ${sizeClasses[size]}`} />
      {/* 加载提示文字 */}
      {text && <span className="text-sm text-slate-500">{text}</span>}
    </div>
  );
}
