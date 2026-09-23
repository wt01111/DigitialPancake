# 电子煎饼

电子技术学习资料、赛题、文章与店铺口碑社区。正式版采用 React/Vite、Express、Node.js 24 LTS 和 SQLite WAL；身份、审核、下载与管理员权限均由服务端校验。

当前仓库是可部署源代码，不代表公网已经上线。域名、DNS、SMTP 和真实 TLS 证书仍需在目标服务器配置。目标系统按 **Ubuntu 24.04 LTS** 编写；“Ubuntu 24.02”不是 Ubuntu LTS 版本号，请在购机或重装前核对镜像名称。

服务器首次开站可按《服务器开站流程.md》的“最少命令的推荐流程”执行：发布脚本生成带逐文件哈希清单的 `digitalpancake.zip`，上传并解压到 `~/digitalpancake` 后，`deploy/quick-install.sh` 会先验包再建立仅限 SSH 隧道访问的预上线环境；ICP备案通过且域名解析生效后，再运行 `deploy/enable-https.sh` 开放正式 HTTPS。脚本预填 `digitalpancake.top`、`43.142.159.194` 和腾讯企业邮箱的非秘密参数；SMTP 密码与站长信息只在服务器隐藏输入，不进入仓库。

## Windows 本地运行

安装 Node.js 24 LTS 后，在 PowerShell 中执行：

```powershell
npm ci
$secret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$localEnv = (Get-Content .env.example -Raw).Replace('replace-with-at-least-32-random-characters', $secret)
Set-Content -LiteralPath .env -Value $localEnv -Encoding UTF8
npm run dev:server
```

另开一个 PowerShell 执行 `npm run dev`。前端为 <http://127.0.0.1:5173>，API 为 <http://127.0.0.1:3001>。也可以双击 `启动本地预览.cmd`，它会在后台启动本工程的前后端并打开浏览器。脚本只操作它为本工程记录且验证过的进程；端口被其他程序占用时会提示，不会结束其他程序。

上述命令会为本机生成随机 `SESSION_SECRET`，不会直接使用示例占位值。根目录 `.env.example` 只用于本地开发；生产环境使用 `deploy/app.env.example`。未配置完整 SMTP 时注册验证码和密码重置返回 503，不会泄露演示验证码。仓库不含真实密码、邮件密钥、数据库或上传文件。

```sh
npm run build
npm start
npm run init-owner
npm run test:api
npm run test:ui
```

首次站长账号用 `npm run init-owner` 初始化。必须先设置有效的 `OWNER_EMAIL`；系统只使用邮箱和密码登录，`Admin` 是默认显示昵称，并非登录用户名。按提示从私密 stdin 输入密码；自动化环境也可临时传 `OWNER_PASSWORD`，但不得写进文件、命令行历史、截图、日志或发布包。该命令只在首次初始化或站长明确要更换最高管理员邮箱、昵称或密码时运行，不能放进服务启动或每次发布流程。下级管理员不再由邮件邀请直接创建：用户先用已验证邮箱正常注册，最高管理员再到“用户与管理员”中将其升为管理员。所有管理员均可管理文章、店铺、评价、评论、举报和赛题；用户账号与管理员身份管理仍仅限最高管理员。

## 数据与公开规则

- 店铺搜索只有在访客提交非空关键词后才返回匹配店铺；空关键词不列出全部店铺。
- 种子数据含 76 家店、82 条已审核历史意见。历史意见标注未经本站核实，不折算为本站星级。
- 新店铺、新评价和投稿先进入审核队列。文章初始为空，不发布占位内容。题库预置 2017—2025 年全国正式赛题及 2018—2026 年陕西省 TI 杯正式赛题；不含邀请赛、教师赛或校际赛。
- 私有附件最多 50 MiB，必须经 API 鉴权下载。生产 `/var/lib/electronic-pancake/uploads` 绝不能由 Nginx 直接映射。
- Markdown 不启用原始 HTML。部署 CSP 允许文章中的 HTTPS 图片，并限制脚本、框架、表单和其他资源来源。

固定演示验证码、演示账号、浏览器身份切换、localStorage 权限判断及管理后台演示入口不属于正式安全边界。正式版以服务端会话、角色权限、审核状态和审计记录为准。

## 投稿与浏览

- 作者可以修改自己的文章和店铺评价；保存后需重新提交审核。审核通过前，访客继续看到上一版已通过内容，拒绝修改稿也不会替换上一版。评价凭证始终仅供本人和有权审核人员查看。
- 文章封面可留空，也可从当前文章上传的图片中选择；只有审核通过的同稿封面和正文图片才会公开。编辑器支持选择文件上传，也支持粘贴或拖入 PNG、JPEG、WebP 图片，并自动插入 Markdown 图片语法，单张图片最多 5 MiB。
- 文章列表可在“逐行列表”和“卡片”两种布局间切换；浏览器会记住本机选择。

## 官方赛题资料

题目清单位于 `server/seed/problems-official.json`，共 91 道：全国赛 56 道、陕西省 TI 杯 35 道。每条记录保存竞赛类型、名称、年份、组别、题号、来源页、官方下载地址、获取时间、分类理由及附件 SHA-256。`npm run validate:content` 会检查清单完整性、文件路径边界、大小和哈希；数据库以稳定 ID 幂等写入，不覆盖站长或用户已有题目。

原始题包只从全国大学生电子设计竞赛陕西赛区官网获取。维护人员可在隔离工作目录运行 `node scripts/import-national-problems.mjs --fetch`，脚本限制下载与解包总量，拒绝路径穿越、链接和特殊文件，且不执行下载内容。Windows 10/11 使用系统自带的 libarchive `tar.exe`；Ubuntu 须先安装 `libarchive-tools poppler-utils`，脚本明确调用 `bsdtar`，因为 GNU tar 不能解官方 RAR。生成后必须再次运行 `npm run validate:content`。分类依据题目正文的主要设计任务，分类值仅为 `signal`、`control`、`power`、`other`；竞赛层级由 `competitionType` 单独表示。

本站收录的常规题目附件保存在 `server/seed/problems-official-files`，仍经登录鉴权下载。2025 年 H 题的两张大图不复制到本站，只在清单中保留官方 H 题附图原包链接、单文件大小与 SHA-256；访问该外链受官方网站策略影响，不经过本站下载鉴权。所有官方题目和附件的权利与许可仍归原权利人，收入本项目不构成重新授权。

## Ubuntu 24.04 LTS 部署

建议规格为 4 GB RAM、6 Mbps 带宽、50 GB 磁盘。6 Mbps 理论峰值约 0.75 MB/s，一个 50 MiB 文件单用户下载至少约 70 秒，实际还会受线路和并发影响。

以下内容是部署概要；第一次开站请按根目录《服务器开站流程.md》的完整顺序执行。示例域名必须替换，且不要把 `/etc/electronic-pancake/app.env` 放进代码包。

1. 更新系统并安装基础软件：

```sh
sudo apt update
sudo apt install git nginx sqlite3 rsync curl unzip xz-utils ca-certificates certbot python3-certbot-nginx
```

2. 创建不可登录的系统账号和目录。代码由 root 发布且全局只读；数据库和上传目录只允许服务账号访问；环境文件目录和备份目录只允许 root 访问：

```sh
sudo useradd --system --home-dir /var/lib/electronic-pancake \
  --shell /usr/sbin/nologin electronic-pancake
sudo install -d -o root -g root -m 0755 \
  /opt/electronic-pancake /opt/electronic-pancake/releases
sudo install -d -o electronic-pancake -g electronic-pancake -m 0700 \
  /var/lib/electronic-pancake /var/lib/electronic-pancake/uploads
sudo install -d -o root -g root -m 0700 \
  /etc/electronic-pancake /var/backups/electronic-pancake
```

如果账号已经存在，`useradd` 会提示已存在，可核对 `getent passwd electronic-pancake` 后继续，不要创建第二个运行账号。
3. 推荐从受控 Git 仓库检出明确的已验收提交或标签，再安装 Node.js 并构建。不要直接部署会继续变化的分支头，也不要把服务器环境文件提交到 Git：

```sh
release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="/opt/electronic-pancake/releases/$release_id"
sudo git clone --branch '<已验收标签或分支>' --single-branch '<仓库URL>' "$release_dir"
cd "$release_dir"
sudo git checkout --detach '<已验收提交SHA>'
sudo chown -R root:root "$release_dir"
sudo find "$release_dir" -type d -exec chmod 0755 {} +
sudo find "$release_dir" -type f -exec chmod 0644 {} +
sudo chmod 0755 "$release_dir"/deploy/*.sh
sudo "$release_dir"/deploy/install-node24.sh
sudo /usr/local/bin/npm ci
sudo /usr/local/bin/npm run build
sudo /usr/local/bin/npm prune --omit=dev
sudo ln -sfn "$release_dir" /opt/electronic-pancake/current.new
sudo mv -Tf /opt/electronic-pancake/current.new /opt/electronic-pancake/current
```

`npm ci` 必须先安装锁文件中的构建依赖，完成 `npm run build` 后再用 `npm prune --omit=dev` 留下生产依赖。把 `<仓库URL>`、标签和完整提交 SHA 替换为实际值，并核对 `git rev-parse HEAD`。

不能让服务器访问 Git 时，可把已验收的白名单 ZIP 上传到临时目录。ZIP 已包含最终 `dist`，因此只需安装生产依赖。仍为每次发布使用新的 UTC 版本目录：

```sh
release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="/opt/electronic-pancake/releases/$release_id"
release_zip="/tmp/electronic-pancake-source-请替换为本次时间戳.zip"
test -f "$release_zip"
sudo install -d -o root -g root -m 0755 "$release_dir"
sudo unzip "$release_zip" -d "$release_dir"
cd "$release_dir"
sudo chown -R root:root "$release_dir"
sudo find "$release_dir" -type d -exec chmod 0755 {} +
sudo find "$release_dir" -type f -exec chmod 0644 {} +
sudo chmod 0755 "$release_dir"/deploy/*.sh
sudo /usr/local/bin/npm ci --omit=dev
sudo ln -sfn "$release_dir" /opt/electronic-pancake/current.new
sudo mv -Tf /opt/electronic-pancake/current.new /opt/electronic-pancake/current
```

必须把 `release_zip` 改成本次上传文件的准确名称。发布包不要包含 `.env`、数据库、上传目录、`node_modules` 或本地日志。
4. 由 `deploy/app.env.example` 创建 `/etc/electronic-pancake/app.env`，设置真实 HTTPS `PUBLIC_ORIGIN`、随机会话密钥、绝对数据路径和最高管理员邮箱 `OWNER_EMAIL`，再执行 `sudo chown root:root /etc/electronic-pancake/app.env && sudo chmod 0600 /etc/electronic-pancake/app.env`。`PUBLIC_ORIGIN` 只能填写一个主域名，例如 `https://example.com`，且必须与 Nginx canonical `server_name` 完全一致。正式数据库会在首次启动时由服务账号创建为 `/var/lib/electronic-pancake/site.sqlite`；不要预先用 root 在项目目录运行后端或初始化命令。

   邮件建议使用域名邮箱或云邮件服务商：先在服务商控制台验证发信域名和 `SMTP_FROM`，再按其给出的值添加 SPF TXT、DKIM TXT/CNAME，并添加 DMARC TXT（初次可用服务商建议的监控策略，确认投递报告后再收紧）。同一域名只能合并为一条有效 SPF 记录。等待服务商确认 DNS 验证通过后，把 SMTP 主机、端口、加密方式、用户名、发件地址写入环境文件；密码或应用专用密钥只写 `SMTP_PASS`，不得进入 Git。端口 465 通常设置 `SMTP_SECURE=true`，STARTTLS 端口通常设置为 `false`，但必须以服务商文档为准。重启服务后，用专用测试邮箱完成注册验证码、密码重置和退信检查，再查看 SPF、DKIM、DMARC 验证结果。SMTP 未准备好时保持相关值为空。
5. 安装并校验 API 服务；确认 `systemd-analyze verify` 没有错误后再启动。只运行一个 API 实例；SQLite WAL 不使用 Node cluster、PM2 多实例或多台共享写入。

```sh
sudo install -o root -g root -m 0644 deploy/electronic-pancake.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/electronic-pancake.service
sudo systemctl daemon-reload
sudo systemctl enable --now electronic-pancake.service
sudo systemctl status electronic-pancake.service --no-pager
```

6. 先手工把 `deploy/nginx/electronic-pancake.conf` 中的 `example.com` 全部替换为唯一主域名。模板将可选的 `www` 别名放在独立 server 块，并永久重定向到主域名，避免浏览器从另一个 Origin 发起 POST。只使用一个域名时，删除整个 `www` 别名 server 块，并且不要创建对应 DNS 记录或申请别名证书。不要把示例域名原样启用。

```sh
sudo install -o root -g root -m 0644 deploy/nginx/electronic-pancake.conf \
  /etc/nginx/sites-available/electronic-pancake.conf
sudo ln -sfn /etc/nginx/sites-available/electronic-pancake.conf \
  /etc/nginx/sites-enabled/electronic-pancake.conf
sudo nginx -t
sudo systemctl reload nginx
```

Nginx 提供 `dist`，只把 `/api/` 原样代理到 `127.0.0.1:3001`；Node 自身提供 `dist` 作为直连兜底，私有上传目录不对外暴露。
7. DNS 的 A/AAAA 记录生效且 80/443 开放后获取真实证书。保留 `www` 别名时执行 `certbot --nginx -d example.com -d www.example.com`，确保两个 HTTPS 主机名都能在证书校验后重定向；只有主域名时执行 `certbot --nginx -d example.com`。随后用 `certbot renew --dry-run` 验证续期。拿到真实域名和证书前不要把 `PUBLIC_ORIGIN` 当成已上线地址。
8. 检查 `curl http://127.0.0.1:3001/healthz` 和 HTTPS 站点，并确认环境文件中的 `OWNER_EMAIL` 是站长用于登录的真实邮箱，再用下列临时 systemd 单元初始化最高管理员。它以服务账号运行、读取与正式服务相同的 EnvironmentFile，并通过当前终端私密输入密码，避免连接错误数据库或留下 root 所有权文件。不要直接在生产目录运行普通 `npm run init-owner`，也不要在公开终端或聊天中传递实际密码。

```sh
sudo systemd-run --pty --wait --collect \
  --uid=electronic-pancake --gid=electronic-pancake \
  --working-directory=/opt/electronic-pancake/current \
  --property=EnvironmentFile=/etc/electronic-pancake/app.env \
  /usr/local/bin/node server/init-owner.js
```

Node.js 官方将 v24 列为 LTS，并建议生产只使用受支持的 LTS：<https://nodejs.org/en/about/previous-releases>。项目安装脚本默认的 24.21.0 可在官方 v24 下载档案核对：<https://nodejs.org/en/download/archive/v24>。Nginx 的 `client_max_body_size` 超限返回 413，本项目设为 52m 给 50 MiB multipart 请求留封装余量，API 仍独立执行 50 MiB 文件限制：<https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size>。

## 备份、恢复与监控

`deploy/backup.sh` 仅在生成 SQLite `.backup` 时短暂停止单实例，随即恢复服务；随后用 `rsync --link-dest` 为不可变私有附件制作硬链接增量快照，避免每天重复压缩全部附件。脚本在快照目录内生成相对路径 SHA-256 清单，默认最多保留 7 份；开始前要求磁盘使用率低于 85% 且至少有 2 GiB 空闲。附件文件一旦落盘不得原地修改，只能新增或用新文件替换引用，否则硬链接快照不成立。

SQLite 官方说明备份 API/`.backup` 用于生成一致快照：<https://www.sqlite.org/backup.html>。安装 `deploy/electronic-pancake-backup.service` 和 `.timer` 后每日运行。生产监控应在磁盘达到 80% 时预警、90% 时严重告警。应用日志进入 journald，用 `journalctl -u electronic-pancake` 查看；Nginx 使用系统 logrotate，也可安装 `deploy/logrotate.conf`。

恢复必须明确指定快照并写 `--confirm`：

```sh
sudo /opt/electronic-pancake/current/deploy/restore.sh \
  /var/backups/electronic-pancake/20260922T032000Z --confirm
```

脚本先验证清单、SQLite 完整性并拒绝上传目录中的链接或特殊文件，在服务仍运行时准备恢复数据，再短暂停服并用同一文件系统内的重命名切换。任何一步失败会尝试回滚并恢复原服务状态；成功后原文件保留在脚本输出的 `.restore-rollback-*` 目录，验收无误后由运维人员明确删除以释放空间。每月至少在隔离测试机演练一次：还原最近备份，检查 `PRAGMA integrity_check`、附件数量与抽样哈希，启动单实例，检查 `/healthz`、登录、搜索、审核及鉴权下载，并记录耗时和结果。

每次发布后检查服务、健康接口、首页与 API。失败时把 `current` 链接切回上一版并重启；数据库迁移若不可逆，先备份并单独准备回滚方案。应用构建、API、邮件流程、浏览器 UI、端到端流程和内容清单已通过 Windows 本地测试及 Ubuntu 24.04 GitHub CI；真实 Nginx、systemd、证书、备份和故障恢复仍未在服务器演练。它们必须在目标 Ubuntu 24.04 服务器或同版本隔离测试机实际验证后才能启用定时任务。
