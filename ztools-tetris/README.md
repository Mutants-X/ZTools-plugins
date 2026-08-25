# ztools-tetris

> 俄罗斯方块游戏插件，支持计分、等级、下一块预览、暂停与最高分记录。

这是一个使用 **Vue 3 + Vite + TypeScript** 构建的 ZTools 插件。

## ✨ 功能特性

- **完整玩法**：七种方块、旋转（简易踢墙）、软降/硬降、幽灵落点提示。
- **计分与等级**：消除 1/2/3/4 行分别得 100/300/500/800 × 等级；每 10 行升一级，下落速度随等级加快。
- **下一块预览**：侧栏实时显示下一块形状。
- **暂停与重开**：`P` / `Esc` 暂停，`R` 重新开始，隐藏页面自动暂停。
- **最高分记录**：通过 `ztools.dbStorage` 持久化（浏览器环境降级 `localStorage`）。
- **主题适配**：透明背景 + 语义化 CSS 变量，自动适配宿主深色/浅色模式。
- **屏幕按钮**：提供鼠标/触屏可用的方向控制按钮。
- **保存战绩截图**：将棋盘渲染为 PNG 保存到下载目录（preload 桥接能力）。

## 🎮 操作方式

| 按键 | 功能 |
| --- | --- |
| `←` / `→` | 左移 / 右移 |
| `↑` / `W` / `X` | 旋转 |
| `↓` / `S` | 软降（每格 1 分） |
| `空格` | 直落到底（每格 2 分） |
| `P` / `Esc` | 暂停 / 继续 |
| `R` | 重新开始 |
| `回车` | 开始游戏 |

## 📁 项目结构

```
.
├── public/
│   ├── logo.png              # 插件图标
│   ├── plugin.json           # 插件配置文件
│   ├── package.json          # CommonJS 声明（preload 依赖）
│   └── preload/
│       ├── package.json      # Preload 依赖配置
│       └── services.js       # Node.js 能力扩展（保存战绩截图）
├── src/
│   ├── main.ts               # 入口文件
│   ├── main.css              # 全局样式与主题变量
│   ├── App.vue               # 根组件
│   ├── env.d.ts              # 类型声明
│   ├── tetris/
│   │   ├── types.ts          # 核心类型
│   │   ├── constants.ts      # 方块形状、颜色与计分常量
│   │   ├── engine.ts         # 纯逻辑引擎（移动/旋转/消行）
│   │   └── useGame.ts        # 游戏状态组合式函数
│   └── components/
│       ├── GameBoard.vue     # 棋盘渲染（自适应尺寸）
│       ├── NextPiece.vue     # 下一块预览
│       ├── Overlay.vue       # 开始/暂停/结束覆盖层
│       └── ControlButtons.vue # 屏幕操作按钮
├── index.html                # HTML 模板
├── vite.config.js            # Vite 配置
├── tsconfig.json             # TypeScript 配置
├── package.json              # 项目依赖
└── README.md                 # 项目文档
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

开发服务器将在 `http://127.0.0.1:5173` 启动（对应 `public/plugin.json` 中的 `development.main`）。

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录，包含 `plugin.json`、`preload/`、`logo.png` 与构建后的页面。

## 🧩 插件配置

`public/plugin.json` 中的触发指令：

- `俄罗斯方块` / `tetris` / `方块游戏`：精确匹配指令，功能 code 为 `tetris`。

## 📄 开源协议

MIT License
