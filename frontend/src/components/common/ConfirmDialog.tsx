// 功能：操作确认弹窗，防止误操作
// 输入参数：open, title, message, confirmText, cancelText, onConfirm, onCancel, variant
// 返回值：对话框 JSX
// 使用场景：删除确认、批量操作确认
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'danger';
}

export default function ConfirmDialog({
  open,
  title = "确认操作",
  message,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  variant = 'default',
}: ConfirmDialogProps) {
  // 未打开时不渲染
  if (!open) return null;

  // 根据变体选择确认按钮样式
  const btnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';

  return (
    // 遮罩层：点击关闭
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      {/* 对话框主体：阻止事件冒泡 */}
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          {/* 危险操作图标 */}
          {variant === 'danger' && <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />}
          <div>
            <h3 className="text-base font-semibold text-slate-800">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">{message}</p>
          </div>
        </div>
        {/* 操作按钮区域 */}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            {cancelText}
          </button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm rounded-lg ${btnClass}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
