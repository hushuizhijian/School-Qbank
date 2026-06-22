// 功能：页面顶部操作栏，显示页面标题和操作按钮
// 输入参数：title(页面标题), actions(右侧操作按钮数组)
// 返回值：顶部栏 JSX
// 使用场景：各页面顶部统一操作栏
import { type ReactNode } from 'react';

interface TopBarProps {
  title: string;
  actions?: ReactNode;
}

export default function TopBar({ title, actions }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
