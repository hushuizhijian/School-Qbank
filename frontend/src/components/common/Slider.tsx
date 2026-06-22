// 功能：拖拽滑块，用于难度调节等
// 输入参数：value, onChange, min, max, step, labels
// 返回值：滑块 JSX
// 使用场景：校对页难度调节
interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  labels?: string[];
}

export default function Slider({ value, onChange, min = 0, max = 2, step = 1, labels }: SliderProps) {
  // 计算当前值对应的百分比，用于进度条着色
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="w-full">
      {/* 滑块输入 */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        style={{ background: `linear-gradient(to right, #2563eb ${percentage}%, #e2e8f0 ${percentage}%)` }}
      />
      {/* 刻度标签 */}
      {labels && (
        <div className="flex justify-between mt-1">
          {labels.map((label, i) => (
            <span
              key={i}
              className={`text-xs ${i === value ? 'text-blue-600 font-medium' : 'text-slate-400'}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
