# 启智归塾·2026夏令营 报名系统

## 项目简介

启智归塾2026夏令营线上报名页面，移动端优先的单页面应用 + 轻量级后端报名数据收集系统。

- **主题**：顺势归心·自然生长
- **地点**：淮安日月洲度假村
- **时间**：2026年8月

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | 原生 HTML + CSS + JS（单文件） |
| 后端 | Node.js + Express |
| 数据库 | SQLite（better-sqlite3） |

## 本地开发

```bash
cd summercamp
npm install
npm start
```

访问 http://localhost:3000 查看页面，后端API运行在同一端口。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 提交报名表单 |
| GET | `/api/registrations` | 查看报名列表（支持分页 `?page=1&page_size=20`） |
| GET | `/api/export` | 导出CSV文件（含BOM，Excel可直接打开） |

## 上线方案（推荐）

### 方案一：全栈部署在 Vercel（最简）

1. 将项目推送到 GitHub 仓库
2. 在 [Vercel](https://vercel.com) 导入该仓库
3. Vercel 自动识别 Node.js 项目，无需额外配置
4. 自动获得 HTTPS 域名，完全免费

### 方案二：前后端分离（更灵活）

- **前端**：GitHub Pages（免费托管静态页面）
  - 将 `index.html` 推送到 GitHub 仓库
  - Settings → Pages 启用
  - 记得修改 `index.html` 中 `API_BASE_URL` 指向后端地址

- **后端**：Vercel / Netlify Functions / Railway（免费额度）
  - Vercel：直接导入仓库，自动部署
  - Railway：免费 $5/月额度，足够使用
  - 数据库文件会随部署保留

### 方案三：云服务器（传统方案）

```bash
# 使用 PM2 守护进程
npm install -g pm2
pm2 start server.js --name summercamp
pm2 save
pm2 startup  # 开机自启
```

配合 Nginx 反向代理即可。

## 文件结构

```
summercamp/
├── index.html        # 前端主页面（HTML+CSS+JS全部内嵌）
├── server.js         # Express后端服务
├── package.json      # 依赖配置
├── README.md         # 本文档
└── registrations.db  # SQLite数据库（运行后自动生成）
```

## 注意事项

1. 生产环境请修改 `index.html` 中的 `API_BASE_URL` 为实际后端地址
2. SQLite 数据库文件请定期备份
3. 建议配合 Nginx 添加速率限制，防止恶意提交
