# 补豆商城数据库无缝迁移计划

> beads 服务器 → catshop 服务器  
> 目标域名：`shopping.aidoucang.cn`（用户端）、`admin-shopping.aidoucang.cn`（管理后台）

---

## 迁移状态

| 项目 | 状态 |
|------|------|
| **迁移完成日期** | 2026-03-08 |
| **停机时长** | 约 5 分钟 |
| **迁移数据量** | 2393 条订单，MAX(id) = 2405 |
| **数据校验** | 总行数、状态分布、MAX(id)、总克数 四项全部通过 |
| **DNS 切换** | `shopping` / `admin-shopping` 已指向 catshop (8.147.235.98) |
| **beads 清理** | Nginx 旧配置已移除，shop 表保留（未归档） |

### 迁移后数据库快照（2026-03-08）

| 指标 | 值 |
|------|---|
| 总订单数 | 2,393 |
| 待确认 (pending) | 1,120 |
| 已确认 (confirmed) | 1,273 |
| 总克数 | 7,609,277 g |
| MAX(id) | 2,405 |
| shop_config | 3 条 |
| catshop_mapping | 295 条 |

### 当前表结构 (`shop_orders`)

```
id              BIGINT AUTO_INCREMENT PRIMARY KEY
order_code      VARCHAR(64) NOT NULL UNIQUE
user_id         BIGINT NULL
items_json      JSON NOT NULL
plan_json       JSON NULL
total_qty       INT NOT NULL DEFAULT 0
color_count     INT NOT NULL DEFAULT 0
taobao_order_no VARCHAR(64) NULL
brand_type      VARCHAR(16) NOT NULL DEFAULT 'mard'
status          ENUM('pending','confirmed') NOT NULL DEFAULT 'pending'
created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at      TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
download_count  INT NOT NULL DEFAULT 0          ← 2026-03-08 新增

索引：
  uk_order_code (order_code)
  idx_shop_orders_created (created_at)
  idx_shop_orders_status_created (status, created_at)
  idx_shop_orders_taobao (taobao_order_no)
```

---

## 一、前置条件汇总

| 条件 | 状态 |
|------|------|
| catshop 代码已测试通过 | ✅ 已完成 |
| catshop PM2 进程运行正常（port 3020） | ✅ 已确认 |
| catshop CORS 已包含目标域名 | ✅ 已确认 |
| catshop Admin 检测支持 `admin-shopping` | ✅ 已确认 |
| catshop SSL 通配符证书（`*.aidoucang.cn`） | ✅ 有效至 2027-04 |
| 两个数据库在同一 RDS 实例 | ✅ `rm-2ze23y3rz62sujzrp` |

---

## 二、前置准备（不停机，可提前执行）

### 步骤 P1：RDS 授权 catshop 用户跨库只读

catshop 用户当前无 beads 库权限。需要通过 root 账号授予 **临时只读权限**：

```sql
-- 通过 RDS root 用户执行（safe-sql.sh --write --confirm）
GRANT SELECT ON beads.shop_orders TO 'catshop'@'%';
GRANT SELECT ON beads.shop_config TO 'catshop'@'%';
FLUSH PRIVILEGES;
```

> 迁移完成后撤销此权限。

### 步骤 P2：预迁移历史数据（不影响线上）

在 catshop 库中执行。此步骤将 beads 中 **已确认（confirmed）的历史订单** 提前同步过来，占总数据量的 ~52%，减少正式切换时的数据量。

```sql
-- 1. 清除 catshop 中的测试数据
TRUNCATE TABLE catshop.shop_orders;

-- 2. 同步 shop_config
INSERT INTO catshop.shop_config (config_key, config_value, updated_at)
SELECT config_key, config_value, updated_at
FROM beads.shop_config;

-- 3. 预迁移已确认的订单（不再变更的数据，最安全）
INSERT INTO catshop.shop_orders
  (id, order_code, user_id, items_json, plan_json, total_qty,
   color_count, taobao_order_no, brand_type, status, created_at, updated_at)
SELECT
  id, order_code, user_id, items_json, plan_json, total_qty,
  color_count, taobao_order_no, brand_type, status, created_at, updated_at
FROM beads.shop_orders
WHERE status = 'confirmed';

-- 4. 记录预迁移水位线
SELECT MAX(id) AS watermark FROM catshop.shop_orders;
-- 记下此值，后续增量同步从此开始
```

### 步骤 P3：验证预迁移数据

```sql
-- 对比两库 confirmed 订单数，必须一致
SELECT
  (SELECT COUNT(*) FROM beads.shop_orders WHERE status='confirmed') AS beads_confirmed,
  (SELECT COUNT(*) FROM catshop.shop_orders WHERE status='confirmed') AS catshop_confirmed;

-- 抽样对比（最近 5 条 confirmed 的 order_code 和 total_qty）
SELECT id, order_code, total_qty FROM beads.shop_orders
WHERE status='confirmed' ORDER BY id DESC LIMIT 5;

SELECT id, order_code, total_qty FROM catshop.shop_orders
WHERE status='confirmed' ORDER BY id DESC LIMIT 5;
```

### 步骤 P4：catshop Nginx 添加目标域名配置

在 catshop 服务器创建新的 Nginx 配置文件（但 DNS 还没切，所以不会有流量进来）：

创建 `/etc/nginx/conf.d/shopping.aidoucang.cn.conf`:

```nginx
server {
    listen 80;
    server_name shopping.aidoucang.cn;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name shopping.aidoucang.cn;

    client_max_body_size 10m;

    ssl_certificate     /etc/nginx/ssl/aidoucang.cn/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/aidoucang.cn/privkey.key;

    access_log /var/log/nginx/shopping.aidoucang.cn.access.log;
    error_log  /var/log/nginx/shopping.aidoucang.cn.error.log;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types application/json application/javascript text/css text/plain text/xml image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }
}
```

创建 `/etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf`:

```nginx
server {
    listen 80;
    server_name admin-shopping.aidoucang.cn;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin-shopping.aidoucang.cn;

    client_max_body_size 10m;

    ssl_certificate     /etc/nginx/ssl/aidoucang.cn/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/aidoucang.cn/privkey.key;

    access_log /var/log/nginx/admin-shopping.aidoucang.cn.access.log;
    error_log  /var/log/nginx/admin-shopping.aidoucang.cn.error.log;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types application/json application/javascript text/css text/plain text/xml image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }
}
```

验证并重载：

```bash
ssh catshop "nginx -t && systemctl reload nginx"
```

### 步骤 P5：验证 catshop 服务通过新域名可访问

由于 DNS 还没切，需要通过修改 Host header 直接测试：

```bash
# 从 catshop 服务器本地测试
ssh catshop "curl -s -H 'Host: shopping.aidoucang.cn' http://127.0.0.1:3020/api/health"
ssh catshop "curl -s -H 'Host: admin-shopping.aidoucang.cn' http://127.0.0.1:3020/api/health"

# 验证 admin 页面路由
ssh catshop "curl -s -o /dev/null -w '%{http_code}' -H 'Host: admin-shopping.aidoucang.cn' http://127.0.0.1:3020/"
# 应返回 200
```

### 前置准备完成后的检查清单

| # | 检查项 | 通过 |
|---|--------|------|
| 1 | catshop.shop_orders confirmed 数量 = beads 一致 | ✅ |
| 2 | catshop.shop_config 3 条数据已同步 | ✅ |
| 3 | catshop Nginx 配置 `nginx -t` 通过 | ✅ |
| 4 | catshop health 通过 shopping.aidoucang.cn Host | ✅ |
| 5 | catshop admin 通过 admin-shopping.aidoucang.cn Host | ✅ |
| 6 | 已记录预迁移水位线 max(id) | ✅ |

---

## 三、正式迁移（低峰期执行，预计 5-10 分钟停机）

> **推荐执行时间**：凌晨 1:00-3:00（最低用户活跃期）

### 步骤 M1：冻结 beads 商城写入（~30秒）

在 beads 服务器上，将商城 Nginx 配置临时指向维护页：

```bash
# 备份当前 Nginx 配置
ssh beads "cp /etc/nginx/conf.d/shopping.aidoucang.cn.conf /etc/nginx/conf.d/shopping.aidoucang.cn.conf.bak"
ssh beads "cp /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf.bak"

# 替换为维护页（只返回停机页面，不代理到应用）
# shopping.aidoucang.cn → 维护页
ssh beads "cat > /etc/nginx/conf.d/shopping.aidoucang.cn.conf << 'NGEOF'
server {
    listen 80;
    server_name shopping.aidoucang.cn;
    return 301 https://\$server_name\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name shopping.aidoucang.cn;
    ssl_certificate     /etc/nginx/ssl/aidoucang.cn/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/aidoucang.cn/privkey.key;
    root /var/www/beads/public;
    location / {
        try_files /maintenance.html =503;
    }
}
NGEOF"

# admin-shopping.aidoucang.cn → 维护页
ssh beads "cat > /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf << 'NGEOF'
server {
    listen 80;
    server_name admin-shopping.aidoucang.cn;
    return 301 https://\$server_name\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name admin-shopping.aidoucang.cn;
    ssl_certificate     /etc/nginx/ssl/aidoucang.cn/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/aidoucang.cn/privkey.key;
    root /var/www/beads/public;
    location / {
        try_files /maintenance.html =503;
    }
}
NGEOF"

# 生效
ssh beads "nginx -t && systemctl reload nginx"
```

> 此时用户访问商城看到"服务器升级中"页面，**无法提交新订单**。
> beads 主站不受影响。

### 步骤 M2：确认写入已冻结（~30秒）

```bash
# 记录此刻 beads 的最大订单 ID
ssh beads "bash /var/www/beads/scripts/safe-sql.sh 'SELECT MAX(id) AS final_max_id, COUNT(*) AS total FROM shop_orders'"
# 记下 final_max_id，这是最终边界
```

### 步骤 M3：增量同步剩余数据（~10秒）

将 P2 预迁移之后新增的 pending 订单 + 新增的 confirmed 订单同步：

```sql
-- 同步所有未迁移的订单（ID > 预迁移水位线，或 status=pending 的所有）
-- 使用 INSERT IGNORE 避免重复
INSERT IGNORE INTO catshop.shop_orders
  (id, order_code, user_id, items_json, plan_json, total_qty,
   color_count, taobao_order_no, brand_type, status, created_at, updated_at)
SELECT
  id, order_code, user_id, items_json, plan_json, total_qty,
  color_count, taobao_order_no, brand_type, status, created_at, updated_at
FROM beads.shop_orders
WHERE id NOT IN (SELECT id FROM catshop.shop_orders);

-- 更新 shop_config（以 beads 为准）
REPLACE INTO catshop.shop_config (config_key, config_value, updated_at)
SELECT config_key, config_value, updated_at
FROM beads.shop_config;

-- 修正 AUTO_INCREMENT
SET @max_id = (SELECT MAX(id) FROM catshop.shop_orders);
SET @next_id = @max_id + 1;
SET @sql = CONCAT('ALTER TABLE catshop.shop_orders AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

### 步骤 M4：数据一致性校验（Go/No-Go 关卡）（~1分钟）

```sql
-- 1. 总行数必须一致
SELECT
  (SELECT COUNT(*) FROM beads.shop_orders) AS beads_total,
  (SELECT COUNT(*) FROM catshop.shop_orders) AS catshop_total;

-- 2. 各状态数量必须一致
SELECT 'beads' AS src, status, COUNT(*) AS cnt FROM beads.shop_orders GROUP BY status
UNION ALL
SELECT 'catshop', status, COUNT(*) FROM catshop.shop_orders GROUP BY status;

-- 3. MAX(id) 必须一致
SELECT
  (SELECT MAX(id) FROM beads.shop_orders) AS beads_max,
  (SELECT MAX(id) FROM catshop.shop_orders) AS catshop_max;

-- 4. 金额/总量交叉校验
SELECT
  (SELECT SUM(total_qty) FROM beads.shop_orders) AS beads_sum,
  (SELECT SUM(total_qty) FROM catshop.shop_orders) AS catshop_sum;
```

**Go/No-Go 判定规则**：

| 检查项 | Go 条件 | No-Go 动作 |
|--------|---------|-----------|
| 总行数 | beads_total = catshop_total | → 回滚（步骤 R1） |
| 状态分布 | 每个状态数量相等 | → 回滚 |
| MAX(id) | 两库一致 | → 回滚 |
| 总克数 | beads_sum = catshop_sum | → 回滚 |

**全部通过 → 继续。任一不通过 → 立即回滚。**

### 步骤 M5：DNS 切换（~1分钟操作，传播 1-5 分钟）

到阿里云 DNS 控制台修改：

| 域名 | 记录 | 旧值 | 新值 |
|------|------|------|------|
| `aidoucang.cn` | `shopping` | 指向 beads (182.92.223.119) | 指向 catshop (8.147.235.98) |
| `aidoucang.cn` | `admin-shopping` | 指向 beads (182.92.223.119) | 指向 catshop (8.147.235.98) |

> DNS 使用 CDN 代理（198.18.x.x），如果是阿里云 CDN，需要在 CDN 控制台修改源站 IP。

### 步骤 M6：验证新服务（~2分钟）

```bash
# 1. 健康检查
curl -s https://shopping.aidoucang.cn/api/health
# 应返回 {"ok":true,"buildTag":"..."}

# 2. 用户端页面
curl -s -o /dev/null -w '%{http_code}' https://shopping.aidoucang.cn/
# 应返回 200

# 3. 管理后台页面
curl -s -o /dev/null -w '%{http_code}' https://admin-shopping.aidoucang.cn/
# 应返回 200

# 4. API 功能测试：查询一个已知订单
curl -s https://shopping.aidoucang.cn/api/shop/order/<已知order_code>
# 应返回订单数据

# 5. 查看 catshop PM2 日志确认请求正常到达
ssh catshop "pm2 logs catshop --lines 20 --nostream"
```

### 步骤 M7：恢复 beads 商城 Nginx 为重定向

DNS 切换验证通过后，将 beads 上的商城 Nginx 改为重定向到新地址（兜底残留缓存的旧 DNS 请求）：

```bash
# 维护页配置改为 301 重定向（保留一段时间）
ssh beads "cat > /etc/nginx/conf.d/shopping.aidoucang.cn.conf << 'NGEOF'
server {
    listen 80;
    server_name shopping.aidoucang.cn;
    return 301 https://shopping.aidoucang.cn\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name shopping.aidoucang.cn;
    ssl_certificate     /etc/nginx/ssl/aidoucang.cn/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/aidoucang.cn/privkey.key;
    return 301 https://shopping.aidoucang.cn\$request_uri;
}
NGEOF"

ssh beads "cat > /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf << 'NGEOF'
server {
    listen 80;
    server_name admin-shopping.aidoucang.cn;
    return 301 https://admin-shopping.aidoucang.cn\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name admin-shopping.aidoucang.cn;
    ssl_certificate     /etc/nginx/ssl/aidoucang.cn/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/aidoucang.cn/privkey.key;
    return 301 https://admin-shopping.aidoucang.cn\$request_uri;
}
NGEOF"

ssh beads "nginx -t && systemctl reload nginx"
```

---

## 四、回滚方案

### 触发条件

以下任一情况触发回滚：

1. 步骤 M4 数据校验不通过
2. 步骤 M6 验证新服务失败
3. DNS 切换后 10 分钟内发现功能异常

### 回滚步骤

#### R1：恢复 beads Nginx 配置（~30秒）

```bash
# 恢复备份的 Nginx 配置
ssh beads "cp /etc/nginx/conf.d/shopping.aidoucang.cn.conf.bak /etc/nginx/conf.d/shopping.aidoucang.cn.conf"
ssh beads "cp /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf.bak /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf"
ssh beads "nginx -t && systemctl reload nginx"
```

> 如果 DNS 已切换，需要同时在 DNS 控制台改回 beads IP。

#### R2：回滚 DNS（~1分钟操作）

将 `shopping` 和 `admin-shopping` 的 DNS/CDN 源站改回 `182.92.223.119`。

#### R3：验证回滚

```bash
curl -s https://shopping.aidoucang.cn/api/health
# 应返回 beads 的 buildTag
```

#### R4：清理 catshop 脏数据（可选，不急）

如果需要重新迁移，在 catshop 库清理后重新来过：

```sql
TRUNCATE TABLE catshop.shop_orders;
TRUNCATE TABLE catshop.shop_config;
```

### 回滚时间线

| 阶段 | 回滚方式 | 预计恢复时间 |
|------|---------|------------|
| M1-M4（DNS 未切） | 恢复 beads Nginx 即可 | < 1 分钟 |
| M5 后（DNS 已切） | DNS 改回 + 恢复 Nginx | 1-5 分钟（取决于 DNS TTL） |

---

## 五、迁移后清理（DNS 稳定 24 小时后）

### 步骤 C1：撤销跨库权限 ✅ 已完成

```sql
REVOKE SELECT ON beads.shop_orders FROM 'catshop'@'%';
REVOKE SELECT ON beads.shop_config FROM 'catshop'@'%';
FLUSH PRIVILEGES;
```

### 步骤 C2：清理 beads 旧 Nginx 配置 ✅ 已完成

```bash
ssh beads "rm /etc/nginx/conf.d/shopping.aidoucang.cn.conf"
ssh beads "rm /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf"
ssh beads "rm /etc/nginx/conf.d/shopping.aidoucang.cn.conf.bak"
ssh beads "rm /etc/nginx/conf.d/admin-shopping.aidoucang.cn.conf.bak"
ssh beads "nginx -t && systemctl reload nginx"
```

### 步骤 C3：清理 catshop 旧域名 Nginx 配置 ✅ 已完成

旧的 `shop.aidoucang.cn` 和 `admin-shop.aidoucang.cn` 配置已移除。

### 步骤 C4：beads 数据库 shop 表归档（待定）

确认 catshop 运行稳定一周后，可考虑将 beads 中的 shop 表重命名归档：

```sql
RENAME TABLE beads.shop_orders TO beads.shop_orders_archived;
RENAME TABLE beads.shop_config TO beads.shop_config_archived;
```

> **当前状态**：beads 中 shop 表仍保留，未归档。可作为灾难恢复的最后一道备份。

---

## 六、时间线总览

```
【前置准备阶段 — 不停机，可白天执行】
  P1  授权跨库只读                  ~1 分钟    ✅
  P2  预迁移 confirmed 订单          ~5 秒     ✅
  P3  验证预迁移数据                  ~1 分钟    ✅
  P4  catshop Nginx 配置新域名        ~5 分钟    ✅
  P5  验证新域名可达性                ~2 分钟    ✅

【正式迁移阶段 — 低峰期执行】
  M1  冻结 beads 商城写入（维护页）    ~30 秒     ✅ ← 停机开始
  M2  确认写入冻结，记录水位线          ~30 秒     ✅
  M3  增量同步剩余数据                 ~10 秒     ✅
  M4  数据一致性校验（Go/No-Go）       ~1 分钟    ✅ 四项全部通过
  M5  DNS 切换                        ~1 分钟    ✅
  M6  验证新服务                      ~2 分钟    ✅ ← 停机结束
  M7  beads Nginx 改为重定向           ~1 分钟    ✅

  实际停机时间：约 5 分钟

【迁移后清理 — 24 小时后】
  C1  撤销跨库权限                              ✅
  C2  清理 beads 旧 Nginx                       ✅
  C3  清理 catshop 旧域名配置                    ✅
  C4  beads shop 表归档（一周后）                 ☐ 待定（保留作为备份）
```

---

## 七、风险评估

| 风险 | 概率 | 影响 | 缓解措施 | 实际结果 |
|------|------|------|---------|---------|
| 增量同步遗漏数据 | 低 | 高 | M4 四项交叉校验，不通过立即回滚 | ✅ 未发生 |
| DNS 传播延迟 | 中 | 中 | beads 维护页兜底，不会丢数据 | ✅ 传播迅速 |
| catshop 代码 bug | 低 | 高 | 已测试；M6 全链路验证 | ✅ 未发生 |
| schema 不兼容 | 低 | 高 | P2 预迁移时提前暴露 | ✅ 未发生 |
| RDS 连接异常 | 极低 | 高 | 同一 RDS 实例，跨库操作已验证 | ✅ 未发生 |

---

## 八、迁移后变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-03-08 | 迁移完成，DNS 切换至 catshop (8.147.235.98) |
| 2026-03-08 | 新增 `download_count` 列（`shop_orders` 表），记录 CSV 下载次数 |
| 2026-03-08 | 新增 `PUT /api/admin/orders/:id/csv-download` 端点 |
| 2026-03-08 | 更新备案号：京ICP备2025156587号-3 / 京公网安备11011402055514号 |
