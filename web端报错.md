Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
:5175/api/ai/providers:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
:5175/api/papers/313aaf06-8824-408e-9228-3fa8d3a1fc7a:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
ProofreadingWorkbench.tsx:235 加载题目失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getPaper (papers.ts:21:15)
    at async ProofreadingWorkbench.tsx:194:21
(匿名) @ ProofreadingWorkbench.tsx:235
:5175/api/ai/providers:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
:5175/api/knowledge/tree?flat=true:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
KnowledgeGraphTree.tsx:846 加载知识树失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getKnowledgeTree (knowledge.ts:7:15)
    at async KnowledgeGraphTree.tsx:828:19
(匿名) @ KnowledgeGraphTree.tsx:846
:5175/api/questions?page=1&page_size=20&in_bank_only=true:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
QuestionBankPage.tsx:135 加载题目失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getQuestions (questions.ts:7:15)
    at async QuestionBankPage.tsx:127:20
(匿名) @ QuestionBankPage.tsx:135
:5175/api/knowledge/tree?flat=true:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
KnowledgeTreePanel.tsx:62 拉取知识树失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getKnowledgeTree (knowledge.ts:7:15)
    at async KnowledgeTreePanel.tsx:54:19
(匿名) @ KnowledgeTreePanel.tsx:62
:5175/api/knowledge/tree?flat=true:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
KnowledgeGraphTree.tsx:846 加载知识树失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getKnowledgeTree (knowledge.ts:7:15)
    at async KnowledgeGraphTree.tsx:828:19
(匿名) @ KnowledgeGraphTree.tsx:846
:5175/api/knowledge/tree?flat=true:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
KnowledgeTreePanel.tsx:62 拉取知识树失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getKnowledgeTree (knowledge.ts:7:15)
    at async KnowledgeTreePanel.tsx:54:19
(匿名) @ KnowledgeTreePanel.tsx:62
:5175/api/papers:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
PaperRecordsPage.tsx:59 获取试卷列表失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getPapers (papers.ts:7:15)
    at async PaperRecordsPage.tsx:54:20
(匿名) @ PaperRecordsPage.tsx:59
:5175/api/papers:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
PaperRecordsPage.tsx:59 获取试卷列表失败: AxiosError: Request failed with status code 500
    at settle (settle.js:19:12)
    at XMLHttpRequest.onloadend (xhr.js:63:9)
    at Axios.request (Axios.js:46:41)
    at async getPapers (papers.ts:7:15)
    at async PaperRecordsPage.tsx:54:20
(匿名) @ PaperRecordsPage.tsx:59
react-dom-client.development.js:26084 Each child in a list should have a unique "key" prop.

Check the render method of `div`. It was passed a child from QuestionItem. See https://react.dev/link/warning-keys for more information.
(匿名) @ react-dom-client.development.js:26084
:5175/:1 [Intervention]
    Images loaded lazily and replaced with placeholders. Load events are deferred. See https://go.microsoft.com/fwlink/?linkid=2048113
react-dom-client.development.js:9410 TypeError: Cannot read properties of undefined (reading 'slice')
    at SelectedKpChip (KnowledgePointPicker.tsx:370:21)
    at Object.react_stack_bottom_frame (react-dom-client.development.js:25904:20)
    at renderWithHooks (react-dom-client.development.js:7662:22)
    at updateFunctionComponent (react-dom-client.development.js:10166:19)
    at beginWork (react-dom-client.development.js:11778:18)
    at runWithFiberInDEV (react-dom-client.development.js:871:30)
    at performUnitOfWork (react-dom-client.development.js:17641:22)
    at workLoopSync (react-dom-client.development.js:17469:41)
    at renderRootSync (react-dom-client.development.js:17450:11)
    at performWorkOnRoot (react-dom-client.development.js:16583:35)

The above error occurred in the <SelectedKpChip> component.

React will try to recreate this component tree from scratch using the error boundary you provided, ErrorBoundary.

defaultOnCaughtError @ react-dom-client.development.js:9410
ErrorBoundary.tsx:109 [ErrorBoundary] 捕获到渲染错误: TypeError: Cannot read properties of undefined (reading 'slice')
    at SelectedKpChip (KnowledgePointPicker.tsx:370:21)
    at Object.react_stack_bottom_frame (react-dom-client.development.js:25904:20)
    at renderWithHooks (react-dom-client.development.js:7662:22)
    at updateFunctionComponent (react-dom-client.development.js:10166:19)
    at beginWork (react-dom-client.development.js:11778:18)
    at runWithFiberInDEV (react-dom-client.development.js:871:30)
    at performUnitOfWork (react-dom-client.development.js:17641:22)
    at workLoopSync (react-dom-client.development.js:17469:41)
    at renderRootSync (react-dom-client.development.js:17450:11)
    at performWorkOnRoot (react-dom-client.development.js:16583:35)
(匿名) @ ErrorBoundary.tsx:109
ErrorBoundary.tsx:110 [ErrorBoundary] 组件栈: 
    at SelectedKpChip (http://localhost:5175/src/components/knowledge/KnowledgePointPicker.tsx:368:3)
    at div (<anonymous>)
    at div (<anonymous>)
    at KnowledgePointPicker (http://localhost:5175/src/components/knowledge/KnowledgePointPicker.tsx:26:3)
    at div (<anonymous>)
    at div (<anonymous>)
    at div (<anonymous>)
    at AttributePanel (http://localhost:5175/src/components/proofreading/AttributePanel.tsx:224:3)
    at div (<anonymous>)
    at div (<anonymous>)
    at div (<anonymous>)
    at ProofreadingWorkbench (http://localhost:5175/src/pages/ProofreadingWorkbench.tsx:94:27)
    at ErrorBoundary (http://localhost:5175/src/components/common/ErrorBoundary.tsx:99:5)
    at RenderedRoute (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:6626:26)
    at Outlet (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:7491:26)
    at main (<anonymous>)
    at div (<anonymous>)
    at MainLayout (http://localhost:5175/src/layouts/MainLayout.tsx:23:20)
    at RenderedRoute (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:6626:26)
    at Routes (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:7561:3)
    at Router (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:7500:13)
    at BrowserRouter (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:10787:3)
    at ThemeProvider (http://localhost:5175/src/components/theme-provider.tsx:26:33)
    at App (<anonymous>)
(匿名) @ ErrorBoundary.tsx:110
react-dom-client.development.js:9410 TypeError: Cannot read properties of undefined (reading 'slice')
    at SelectedKpChip (KnowledgePointPicker.tsx:370:21)
    at Object.react_stack_bottom_frame (react-dom-client.development.js:25904:20)
    at renderWithHooks (react-dom-client.development.js:7662:22)
    at updateFunctionComponent (react-dom-client.development.js:10166:19)
    at beginWork (react-dom-client.development.js:11778:18)
    at runWithFiberInDEV (react-dom-client.development.js:871:30)
    at performUnitOfWork (react-dom-client.development.js:17641:22)
    at workLoopSync (react-dom-client.development.js:17469:41)
    at renderRootSync (react-dom-client.development.js:17450:11)
    at performWorkOnRoot (react-dom-client.development.js:16583:35)

The above error occurred in the <SelectedKpChip> component.

React will try to recreate this component tree from scratch using the error boundary you provided, ErrorBoundary.

defaultOnCaughtError @ react-dom-client.development.js:9410
ErrorBoundary.tsx:109 [ErrorBoundary] 捕获到渲染错误: TypeError: Cannot read properties of undefined (reading 'slice')
    at SelectedKpChip (KnowledgePointPicker.tsx:370:21)
    at Object.react_stack_bottom_frame (react-dom-client.development.js:25904:20)
    at renderWithHooks (react-dom-client.development.js:7662:22)
    at updateFunctionComponent (react-dom-client.development.js:10166:19)
    at beginWork (react-dom-client.development.js:11778:18)
    at runWithFiberInDEV (react-dom-client.development.js:871:30)
    at performUnitOfWork (react-dom-client.development.js:17641:22)
    at workLoopSync (react-dom-client.development.js:17469:41)
    at renderRootSync (react-dom-client.development.js:17450:11)
    at performWorkOnRoot (react-dom-client.development.js:16583:35)
(匿名) @ ErrorBoundary.tsx:109
ErrorBoundary.tsx:110 [ErrorBoundary] 组件栈: 
    at SelectedKpChip (http://localhost:5175/src/components/knowledge/KnowledgePointPicker.tsx:368:3)
    at div (<anonymous>)
    at div (<anonymous>)
    at KnowledgePointPicker (http://localhost:5175/src/components/knowledge/KnowledgePointPicker.tsx:26:3)
    at div (<anonymous>)
    at div (<anonymous>)
    at div (<anonymous>)
    at AttributePanel (http://localhost:5175/src/components/proofreading/AttributePanel.tsx:224:3)
    at div (<anonymous>)
    at div (<anonymous>)
    at div (<anonymous>)
    at ProofreadingWorkbench (http://localhost:5175/src/pages/ProofreadingWorkbench.tsx:94:27)
    at ErrorBoundary (http://localhost:5175/src/components/common/ErrorBoundary.tsx:99:5)
    at RenderedRoute (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:6626:26)
    at Outlet (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:7491:26)
    at main (<anonymous>)
    at div (<anonymous>)
    at MainLayout (http://localhost:5175/src/layouts/MainLayout.tsx:23:20)
    at RenderedRoute (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:6626:26)
    at Routes (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:7561:3)
    at Router (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:7500:13)
    at BrowserRouter (http://localhost:5175/node_modules/.vite/deps/react-router-dom.js?v=1ac85cc0:10787:3)
    at ThemeProvider (http://localhost:5175/src/components/theme-provider.tsx:26:33)
    at App (<anonymous>)