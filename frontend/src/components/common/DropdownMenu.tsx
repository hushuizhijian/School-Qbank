// 功能：点击触发的下拉菜单
// 输入参数：trigger, items
// 返回值：下拉菜单 JSX
// 使用场景：更多操作、筛选下拉
import { useState, useRef, useEffect, type ReactNode } from 'react';

// 下拉菜单项配置
interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
}

interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownItem[];
}

export default function DropdownMenu({ trigger, items }: DropdownMenuProps) {
  // 菜单展开状态
  const [open, setOpen] = useState(false);
  // 容器引用，用于点击外部检测
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* 触发器 */}
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {/* 下拉菜单面板 */}
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 ${item.danger ? 'text-red-600' : 'text-slate-700'}`}
            >
              {/* 菜单项图标 */}
              {item.icon}
              {/* 菜单项文字 */}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
