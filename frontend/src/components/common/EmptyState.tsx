// 功能：列表为空时的占位提示
// 输入参数：icon, title, description, action
// 返回值：空状态 JSX
// 使用场景：题库无结果、作业列表为空
import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title = "暂无数据", description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* 图标区域：默认使用收件箱图标 */}
      <div className="text-slate-300 mb-4">{icon || <Inbox className="w-12 h-12" />}</div>
      {/* 标题 */}
      <h3 className="text-base font-medium text-slate-600 mb-1">{title}</h3>
      {/* 描述文字 */}
      {description && <p className="text-sm text-slate-400 mb-4">{description}</p>}
      {/* 操作按钮区域 */}
      {action}
    </div>
  );
}
