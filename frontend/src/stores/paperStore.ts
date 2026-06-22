// 功能：管理试卷相关状态（当前试卷、解析进度、文件列表）
// 使用 Zustand 5
import { create } from 'zustand';

// 试卷文件信息
interface PaperFile {
  id: string;
  filename: string;
  size: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
}

// 解析进度信息
interface ParseProgress {
  stage: string;
  current: number;
  total: number;
  message: string;
}

// 试卷状态接口
interface PaperState {
  // 当前试卷 ID
  currentPaperId: string | null;
  // 文件列表
  files: PaperFile[];
  // 解析进度
  parseProgress: ParseProgress | null;
  // 解析状态
  isParsing: boolean;
  // 操作方法
  setCurrentPaper: (id: string | null) => void;
  addFile: (file: PaperFile) => void;
  removeFile: (id: string) => void;
  setParseProgress: (progress: ParseProgress | null) => void;
  setIsParsing: (parsing: boolean) => void;
  reset: () => void;
}

// 初始状态
const initialState = {
  currentPaperId: null,
  files: [],
  parseProgress: null,
  isParsing: false,
};

export const usePaperStore = create<PaperState>((set) => ({
  ...initialState,

  // 设置当前试卷 ID
  setCurrentPaper: (id) => set({ currentPaperId: id }),

  // 添加文件到列表
  addFile: (file) => set((state) => ({ files: [...state.files, file] })),

  // 从列表中移除文件
  removeFile: (id) => set((state) => ({ files: state.files.filter((f) => f.id !== id) })),

  // 设置解析进度
  setParseProgress: (progress) => set({ parseProgress: progress }),

  // 设置解析状态
  setIsParsing: (parsing) => set({ isParsing: parsing }),

  // 重置所有状态
  reset: () => set(initialState),
}));
