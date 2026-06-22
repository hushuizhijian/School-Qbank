// 功能：分页导航组件
// 输入参数：page, pageSize, total, onChange
// 返回值：分页器 JSX
// 使用场景：题库列表、作业列表
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  // 计算总页数
  const totalPages = Math.ceil(total / pageSize);

  // 只有一页时不显示分页器
  if (totalPages <= 1) return null;

  // 生成页码数组，中间用省略号连接
  const pages: (number | string)[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      {/* 总条数显示 */}
      <span className="text-sm text-slate-500 mr-4">共 {total} 条</span>
      {/* 上一页按钮 */}
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {/* 页码按钮 */}
      {pages.map((p, i) => (
        typeof p === 'number' ? (
          <button
            key={i}
            onClick={() => onChange(p)}
            className={`min-w-[32px] h-8 text-sm rounded ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}
          >
            {p}
          </button>
        ) : (
          <span key={i} className="px-1 text-slate-400">...</span>
        )
      ))}
      {/* 下一页按钮 */}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
