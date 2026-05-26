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
| 数据库 | JSON 文件存储（/tmp/registrations.json） |

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

## 上线方案

### 🏅 方案一：腾讯云 EdgeOne Pages（国内首选，免费）

Vercel 在国内被墙，EdgeOne Pages 是腾讯云的全栈部署平台，国内直连，支持 Express 后端。

1. 打开 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages)
2. 用 GitHub 账号授权登录
3. 点击「导入 Git 仓库」→ 选择 `Angus-Feng/qizhi-summercamp-2026`
4. 框架预设选 **Express**，构建配置无需修改
5. 点击「开始部署」，1-2 分钟完成
6. 获得 `https://xxx.edgeonepages.com` 国内可访问域名

> **数据持久化**：EdgeOne Pages 免费版 `/tmp` 目录在冷启动后会清空。建议定期导出 CSV 备份，或后续接入腾讯云轻量数据库（最低 30 元/月）。

### 方案二：Vercel（海外可用，免费）

1. 推送到 GitHub → [Vercel](https://vercel.com) 导入
2. 自动获得 `https://xxx.vercel.app` 域名
3. ⚠️ 国内访问需要 VPN

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
├── index.html                              # 前端主页面（HTML+CSS+JS 全部内嵌）
├── server.js                               # Express 后端（本地开发 / Vercel）
├── node-functions/express/[[default]].js   # EdgeOne Pages Node Functions 入口
├── edgeone.json                            # EdgeOne Pages 配置
├── package.json                            # 依赖配置
├── vercel.json                             # Vercel 配置
└── README.md                               # 本文档
```

## 注意事项

1. 生产环境请修改 `index.html` 中的 `API_BASE_URL` 为实际后端地址
2. SQLite 数据库文件请定期备份
3. 建议配合 Nginx 添加速率限制，防止恶意提交
