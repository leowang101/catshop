# AI 助手开发指南 - 猫咪家补豆商城

本文档为 AI 助手提供**猫咪家补豆商城**（catshop）代码库的全面指导，包含项目概览、服务器运维、部署流程和开发规范。

---

## 项目概述

猫咪家补豆商城是一个基于 Web 的拼豆（MARD 色号）在线选购平台，部署在专用服务器上。核心功能：

- 按色号/色系浏览和选购拼豆（支持 MARD / 猫咪家双品牌切换）
- AI 智能识别（文字/图片解析补豆需求，DashScope Qwen）
- 补豆口令生成与查询
- 管理后台（订单管理、规格配置、色号上下架、数据看板）
- 试用码代理（通过合作方 API 连接 `aidoucang.cn` 主站服务）

### GitHub 仓库

```
git@github.com:leowang101/catshop.git
```

---

## 技术栈

| 组件 | 技术 |
|------|------|
| **后端** | Node.js (CommonJS), Express.js |
| **数据库** | 阿里云 RDS MySQL 8.0（`catshop` 库） |
| **前端** | 原生 HTML/CSS/JS（无框架），单页应用 |
| **AI 服务** | 阿里云 DashScope (Qwen-VL / Qwen-Text) |
| **日志** | Pino（JSON 格式） |
| **进程管理** | PM2（fork 模式） |
| **反向代理** | Nginx + Let's Encrypt SSL |
| **前端构建** | Terser（JS 压缩）+ CleanCSS（CSS 压缩） |

---

## 服务器与环境配置

### SSH 连接信息

- **Host 别名**: `catshop`
- **服务器地址**: `8.147.235.98`
- **用户**: `root`
- **认证方式**: SSH 密钥认证（`~/.ssh/id_ed25519`）

```ssh-config
Host catshop
  HostName 8.147.235.98
  User root
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking no
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

### 域名配置

| 域名 | 用途 | 代理目标 |
|------|------|---------|
| `https://shopping.aidoucang.cn` | 用户端商城 | `127.0.0.1:3020` |
| `https://admin-shopping.aidoucang.cn` | 管理后台 | `127.0.0.1:3020` |
| `https://metabase.leobeads.xyz` | Metabase 数据分析 | `127.0.0.1:3001`（Docker） |

### Nginx 配置文件

```
/etc/nginx/conf.d/
├── shopping.aidoucang.cn.conf          # 用户端商城
├── admin-shopping.aidoucang.cn.conf    # 管理后台
└── metabase.leobeads.xyz.conf          # Metabase（Docker）
```

### SSL 证书

```
/etc/nginx/ssl/aidoucang.cn/
├── fullchain.crt    # 通配符证书 *.aidoucang.cn（有效至 2027-04）
└── privkey.key
```

### 其他服务

- **Metabase**：Docker Compose 部署（`metabase/metabase:v0.58.5.x` + PostgreSQL 16），端口 3001
- **数据库**：阿里云 RDS MySQL 8.0（实例 `rm-2ze23y3rz62sujzrp`，`catshop` 库）

---

## 部署流程

> **⚠️ 部署规范（AI 助手必须遵守）**
> - ❌ **绝对禁止**通过 `scp`、`rsync` 或任何方式直接上传文件到服务器
> - ❌ **绝对禁止**在服务器上直接编辑代码文件
> - ✅ **唯一正确的部署方式**：本地修改 → `git commit` → `git push` → 服务器 `git pull` + `npm run build` + `pm2 reload`

### 部署命令

```bash
ssh catshop "cd /var/www/catshop && git pull origin main && npm run build && pm2 reload catshop"
```

> `npm run build` 压缩 JS/CSS 生成 `.min` 文件，服务端检测到后自动使用压缩版本。

### PM2 配置

单实例 fork 模式（`ecosystem.config.js`）：

```bash
# 首次启动
ssh catshop "cd /var/www/catshop && pm2 start ecosystem.config.js --env production"

# 后续重启
ssh catshop "cd /var/www/catshop && pm2 reload catshop"
```

---

## 常用运维命令

### PM2 进程管理

```bash
ssh catshop "pm2 status"
ssh catshop "pm2 logs catshop --lines 50 --nostream"
ssh catshop "pm2 reload catshop"
```

### Nginx 操作

```bash
ssh catshop "nginx -t"
ssh catshop "systemctl reload nginx"
```

### 系统监控

```bash
ssh catshop "df -h"
ssh catshop "free -h"
ssh catshop "docker ps"          # Metabase 容器状态
```

### 数据库查询

通过应用连接 RDS 执行查询：

```bash
# 在服务器上使用 node 执行查询（推荐）
ssh catshop "cd /var/www/catshop && node -e \"
  require('dotenv/config');
  const pool = require('./src/db/pool');
  pool.query('SELECT COUNT(*) AS total FROM shop_orders')
    .then(([r]) => { console.log(r[0]); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
\""
```

---

## 项目结构

```
catshop/
├── index.js                 # 应用入口
├── package.json             # 依赖包
├── .env.example             # 环境变量模板
├── CLAUDE.md                # 本文件（AI 助手指南）
├── ecosystem.config.js      # PM2 配置
│
├── src/                     # 后端源代码
│   ├── server.js            # Express 应用、路由挂载、子域名路由、健康检查
│   ├── db/
│   │   ├── pool.js          # MySQL 连接池
│   │   └── schema.js        # 数据库 schema 初始化（建表 + seed）
│   ├── middleware/
│   │   └── adminAuth.js     # 管理后台认证（IP 限流 + HMAC Token + 暴力破解防护）
│   ├── routes/
│   │   ├── shop.js          # 商城 API（订单、AI 识别、规格配置）
│   │   └── admin.js         # 管理后台 API（订单管理、配置、看板）
│   └── utils/               # 工具函数（8 个文件）
│       ├── catshop-mapping.js # MARD → 猫咪家色号映射
│       ├── constants.js     # 环境变量和常量
│       ├── helpers.js       # AI 返回文本 JSON 提取
│       ├── logger.js        # Pino 日志器配置
│       ├── observability.js # 请求追踪、withHandler、AsyncLocalStorage
│       ├── palette.js       # MARD 色盘数据（295 色）+ 套装定义
│       ├── respond.js       # JSON 响应、CORS 配置
│       └── validate.js      # 输入验证工具（vStr/vInt/vBool/vEnum/vArray）
│
├── public/                  # 前端静态文件
│   ├── index.html           # 商城 SPA 入口
│   ├── admin.html           # 管理后台
│   ├── admin-trial-tracking.html # 体验码转化跟踪
│   ├── js/
│   │   ├── shop-app.js      # 商城主应用（含内联色盘、品牌切换、AI、结算）
│   │   └── shop-app.min.js  # 压缩版
│   ├── css/
│   │   ├── base.css         # 基础样式、变量、组件
│   │   ├── base.min.css     # 压缩版
│   │   ├── shop.css         # 商城、结算、品牌、暗色模式
│   │   └── shop.min.css     # 压缩版
│   ├── img/                 # 品牌图标、规格图片
│   └── vendor/              # 第三方 SDK（自托管）
│       ├── html2canvas/     # 截图库
│       └── qrcodejs/        # 二维码生成库
│
├── scripts/
│   └── build.js             # 前端构建（JS/CSS 压缩）
│
└── docs/
    └── migration-plan.md    # 数据库迁移计划
```

### 关键文件路径（服务器）

```
/var/www/catshop/                       # 应用目录
/etc/nginx/conf.d/                      # Nginx 配置
/etc/nginx/ssl/aidoucang.cn/            # SSL 证书
~/.pm2/logs/                            # PM2 日志
```

---

## 数据库架构

### Schema 管理

采用 `ensureSchema()`（`src/db/schema.js`）：启动时自动建表 + seed 映射数据。

### 表结构

| 表名 | 用途 |
|------|------|
| `shop_orders` | 补豆商城订单 |
| `shop_config` | 商城全局配置（规格上下架等，键值对） |
| `catshop_mapping` | MARD ↔ 猫咪家色号映射（启动时自动 seed） |

#### `shop_orders`

| 列 | 类型 | 说明 |
|----|------|------|
| id | BIGINT AUTO_INCREMENT | 主键 |
| order_code | VARCHAR(64) UNIQUE | 补豆口令 |
| user_id | BIGINT NULL | 用户 ID（可空） |
| items_json | JSON | 订单明细 |
| plan_json | JSON NULL | 购买方案 |
| total_qty | INT | 总克数 |
| color_count | INT | 色号数量 |
| taobao_order_no | VARCHAR(64) NULL | 淘宝订单号 |
| brand_type | VARCHAR(16) | 品牌类型（mard/catshop） |
| status | ENUM('pending','confirmed') | 订单状态 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP NULL | 更新时间 |

**索引**：`uk_order_code`、`idx_shop_orders_created`、`idx_shop_orders_status_created`、`idx_shop_orders_taobao`

#### `shop_config`

| 列 | 类型 | 说明 |
|----|------|------|
| config_key | VARCHAR(64) | 主键 |
| config_value | TEXT | 配置值 |
| updated_at | TIMESTAMP | 更新时间 |

#### `catshop_mapping`

| 列 | 类型 | 说明 |
|----|------|------|
| mard_code | VARCHAR(16) | MARD 色号（主键） |
| catshop_code | VARCHAR(16) | 猫咪家色号（唯一） |

---

## 关键 API 端点

### 商城 API（公开，无需认证）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/public/palette` | GET | 获取色盘数据 |
| `/api/shop/spec-config` | GET | 获取规格上下架配置 |
| `/api/shop/disabled-codes` | GET | 获取下架色号列表 |
| `/api/shop/order` | POST | 保存/更新补豆口令 |
| `/api/shop/order/:code` | GET | 按口令或淘宝单号查询订单 |
| `/api/shop/ai-text` | POST | AI 文字识别补豆需求 |
| `/api/shop/ai-image` | POST | AI 图片识别补豆需求（multipart） |

### 管理后台 API（需 AdminAuth）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/admin/login` | POST | 管理员登录 |
| `/api/admin/stats` | GET | 数据看板统计 |
| `/api/admin/orders` | GET | 订单列表（分页、筛选、main/archive 视图） |
| `/api/admin/orders/:id` | GET | 订单详情 |
| `/api/admin/orders/:id/confirm` | PUT | 确认/取消确认订单 |
| `/api/admin/orders/:id/taobao` | PUT | 修改淘宝订单备注 |
| `/api/admin/orders/:id/duplicate` | POST | 复制清单生成新口令 |
| `/api/admin/spec-config` | GET | 获取规格配置 |
| `/api/admin/spec-config` | PUT | 更新规格配置 |
| `/api/admin/disabled-codes` | GET | 获取下架色号 |
| `/api/admin/disabled-codes` | PUT | 更新下架色号 |
| `/api/admin/generate-trial-code` | POST | 代理生成试用码（转发主站） |
| `/api/admin/trial-codes` | GET | 代理查询试用码（转发主站） |

### API 响应格式

成功：
```json
{ "ok": true, "data": { ... }, "buildTag": "catshop-xxx" }
```

错误：
```json
{ "ok": false, "message": "错误描述" }
```

---

## 认证系统

### 管理后台认证（AdminAuth）

- **工厂函数**：`createAdminAuth()`（`src/middleware/adminAuth.js`）
- **认证方式**：HMAC-SHA256 签名 Token
- **Token 有效期**：7 天（可配置）
- **暴力破解防护**：同一 IP 10 次失败后锁定 15 分钟
- 用户名/密码/Secret 从环境变量读取

---

## 核心业务逻辑

### 1. 品牌切换

前端支持 MARD 和猫咪家两种品牌模式：
- MARD 模式：显示 MARD 色号（H1、H2...）
- 猫咪家模式：显示猫咪家数字编号（1、2、3...），通过 `MARD_TO_CATSHOP` 映射

### 2. 补豆选购流程

1. 用户选择品牌（MARD / 猫咪家）
2. 按色系浏览色号，选择规格（10g/20g/50g/100g）添加到购物车
3. 购物车结算，生成补豆口令（6 位随机码）
4. 用户复制口令给商家

### 3. AI 智能识别

- **文字识别**（`/api/shop/ai-text`）：用户输入文字描述，Qwen-Text 解析色号和数量
- **图片识别**（`/api/shop/ai-image`）：用户上传图片，Qwen-VL 解析色号和数量
- 两种模式均返回结构化的色号+数量列表

### 4. 管理后台功能

- **数据看板**：订单统计（总数、待处理、已确认、总克数）
- **订单管理**：分页浏览、按状态筛选、主视图/归档视图
- **订单操作**：确认/取消确认、修改淘宝单号、复制清单
- **规格配置**：控制各规格（10g/20g/50g/100g）的上下架
- **色号管理**：设置下架色号
- **试用码**：代理主站的试用码生成和查询

### 5. 前端色盘数据

`shop-app.js` 中**内联**了完整的 295 色盘数据（`const P=[...]`），不依赖后端 API 获取色盘。

> **注意**：修改色盘时需同时更新 `src/utils/palette.js`（后端）和 `public/js/shop-app.js` 中的内联数据。可通过以下脚本生成内联数据：
> ```bash
> node -e "const {PALETTE_ALL}=require('./src/utils/palette'); console.log(PALETTE_ALL.map(c=>JSON.stringify([c.code,c.hex,c.series,c.isDefault?1:0])).join(','))"
> ```

---

## 环境变量

完整分组见 `.env.example`：

```bash
# ==== 应用服务 ====
PORT=3020
NODE_ENV=production
SERVE_FRONTEND=true

# ==== 数据库（catshop 独立 RDS） ====
DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME

# ==== 管理后台认证 ====
ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_TOKEN_SECRET

# ==== AI（DashScope / Qwen） ====
DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL / QWEN_TEXT_MODEL / QWEN_VL_MODEL

# ==== 合作方 API（连接主站试用码服务） ====
PARTNER_API_SECRET / PARTNER_API_BASE_URL

# ==== CORS（可选） ====
# CORS_ORIGINS=https://shopping.aidoucang.cn,https://admin-shopping.aidoucang.cn
```

---

## Git 操作规范

### Commit Message 规范

- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构
- `style`: 样式调整
- `docs`: 文档更新
- `chore`: 构建/工具链变更

### 示例

```bash
git commit -m "feat: 新增批量下单功能"
git commit -m "fix: 修复商城色盘内联数据色值错乱"
git commit -m "refactor: 优化订单查询性能"
```

---

## 开发指南

### 代码风格

- 使用 CommonJS（`require`/`module.exports`）
- 使用 `async/await` 处理异步操作
- 所有路由使用 `withHandler` 包装（可观测性）
- JSON 响应使用 `sendJson` 辅助函数
- 输入验证使用 `src/utils/validate.js`（vStr / vInt / vBool / vEnum / vArray）

### 错误处理

- API 错误返回 `{ ok: false, message: "错误信息" }`
- 使用 try-catch 块
- 数据库错误记录日志但不暴露详情

### 前端技术要点

- 原生 JavaScript，全局作用域，IIFE 包裹
- `shop-app.js` 是独立模块，自包含色盘数据和全部商城逻辑
- 使用 `localStorage` 保存品牌偏好、购物车数据
- AI 图片上传使用 `multer`（后端）处理 multipart
- 二维码生成使用自托管 `qrcodejs`
- 截图使用自托管 `html2canvas`

### 添加新功能

1. 后端路由加在 `src/routes/shop.js` 或 `src/routes/admin.js`
2. 新表/新列加在 `src/db/schema.js`
3. 在 `src/server.js` 注册路由（如新建路由文件）
4. 前端逻辑修改 `public/js/shop-app.js` 或 `public/admin.html`
5. 执行 `npm run build` 生成压缩文件

### 数据库变更规范

- 新表/新列加在 `src/db/schema.js` 的 `ensureSchema()` 中
- 使用 `CREATE TABLE IF NOT EXISTS` 和 `ALTER TABLE ... ADD COLUMN` 保证幂等

---

## 安全注意事项

### 数据库安全规范（AI 助手必须遵守 — 零容忍）

#### 绝对禁止

- ❌ **绝对禁止**在未获得用户明确指令前，执行任何不可逆的数据库写入或删除操作
- ❌ **绝对禁止**执行不带 `WHERE` 条件的 `DELETE` / `UPDATE`
- ❌ **绝对禁止**执行 `DROP TABLE` / `TRUNCATE` / `ALTER TABLE ... DROP`
- ❌ **绝对禁止**直接修改生产数据（必须先向用户展示 SQL 并获得确认）

#### 必须遵守的操作流程

**查询数据（只读）：** 随时可执行，无需额外确认。

**修改数据（需用户明确授权）：**
1. 先向用户展示完整 SQL、影响范围和风险评估
2. **等待用户明确回复「确认执行」**后才可执行
3. 执行后验证结果并报告

> **判断标准**：如果一条 SQL 执行后无法通过简单操作撤销（如 DELETE、UPDATE、DROP、TRUNCATE、ALTER TABLE DROP COLUMN），则视为「不可逆操作」，必须获得用户明确指令。INSERT 可以通过 DELETE 撤销，但批量 INSERT 仍建议先确认。

### 密码/密钥原则

- ❌ **禁止**在代码中硬编码密码
- ✅ 敏感信息存放在 `.env` 文件（已加入 `.gitignore`）

### 管理后台安全

- HMAC-SHA256 Token 认证
- 暴力破解防护：10 次失败锁定 15 分钟
- `X-Real-IP` / `X-Forwarded-For` 获取真实客户端 IP

### Nginx 安全头

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

---

## 故障排查清单

### 应用无法访问

1. 检查 PM2：`ssh catshop "pm2 status"`
2. 查看日志：`ssh catshop "pm2 logs catshop --lines 100 --nostream"`
3. 检查端口：`ssh catshop "netstat -tlnp | grep 3020"`
4. 检查 Nginx：`ssh catshop "systemctl status nginx"`

### 数据库问题

1. 检查 RDS 连接：查看 PM2 日志中是否有连接错误
2. 验证 `.env` 中的数据库配置

### AI 识别不工作

- 确认 `DASHSCOPE_API_KEY` 已配置
- 查看日志：`ssh catshop "pm2 logs catshop --lines 50 --nostream"`
- 检查 DashScope 服务状态和 API 配额

### 内存不足

- 查看内存：`ssh catshop "free -h"`（服务器总内存 1.8GB，较紧张）
- 检查 Docker 占用：`ssh catshop "docker stats --no-stream"`
- 必要时重启 PM2：`ssh catshop "pm2 reload catshop"`

---

## 更新记录

- **2026-03-08**: 修复商城色盘内联数据色值错乱（295 色全部替换为 MARD 标准值）
- **2026-03-08**: 独立部署上线，DNS 切换至专用服务器

---

## 相关资源

- [阿里云 DashScope 文档](https://help.aliyun.com/product/611592.html)
- [Express.js 文档](https://expressjs.com/)
