// 功能：鼠标悬停显示提示信息
// 输入参数：content, children, position
// 返回值：带提示的 JSX
// 使用场景：图标说明、数据解释
import { useState, type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

// 各方向对应的定位样式
const positionClasses = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export default function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  // 控制提示框显示状态
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* 子元素作为触发区域 */}
      {children}
      {/* 提示框：仅在可见时渲染 */}
      {visible && (
        <div className={`absolute z-50 px-2 py-1 text-xs text-white bg-slate-800 rounded whitespace-nowrap pointer-events-none ${positionClasses[position]}`}>
          {content}
        </div>
      )}
    </div>
  );
}
