# 聪聪学习计划：云端部署说明

## 线上架构

```text
浏览器
  -> Nginx / HTTPS
  -> Next.js (Node.js, 127.0.0.1:3001)
  -> PostgreSQL（题库、单词、答题记录、跨设备学习进度）
  -> /var/lib/study-plan/uploads（用户上传文件，独立于代码发布目录）
```

GitHub 保存代码和通过 Git LFS 管理的听力音频/题面。推送到 `main` 后，
`.github/workflows/deploy.yml` 会把代码上传到独立的
`/www/study-plan-releases/<commit>-<run>-<attempt>`，在该目录安装依赖、构建并预检。
预检通过后才保存数据库备份、执行兼容旧版本的迁移，并短暂停止服务以切换目录。
健康检查失败时自动恢复原目录和服务，不自动回退数据库，以免覆盖发布期间的新学习记录。

日常发布保留服务器现有环境文件、独立维护的英语资料、听力媒体和持久上传文件，
不覆盖已启用 HTTPS 的 Nginx 配置或现有 systemd 服务。英语资料的独立修订仍使用
对应的资料发布流程，不能仅凭代码工作流成功就认定资料修订已经启用。

发布保留旧站的完整目录（包括依赖及构建），不会删除现有 `.next-before-*` 回滚点。
历史发布目录和数据库备份需要在确认无恢复需求后另行清理；工作流不会自动删除它们。

## GitHub Secrets

仓库的 Actions Secrets 必须设置：

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_PORT`（可选，默认 22）
- `SERVER_SSH_KEY`

缺少任何必要 Secret 时部署会明确失败，不会显示“成功但未部署”。

## 生产环境变量

将 `study-plan/.env.example` 复制为服务器上的 `/etc/study-plan.env`，填入真实值，
权限设置为仅 root 可读。不要将该文件或任何密码提交到 GitHub。

最少需要：

- `FAMILY_ACCESS_PASSWORD`
- `FAMILY_ACCESS_SECRET`
- `DATABASE_URL`，或者完整的 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`
- `STORAGE_ROOT=/var/lib/study-plan/uploads`
- `ALLOW_LOCAL_DATA_FALLBACK=false`

## 一次性服务器准备

1. 创建持久化上传目录，并把所有权交给运行 Next.js 的 `ubuntu` 用户。
2. 将 `deploy/study-plan.service` 安装到 `/etc/systemd/system/`。
3. 将 `deploy/nginx.conf` 安装为 Nginx 站点配置。
4. 执行 `npm run db:migrate`，再重启 `study-plan`。
5. 为 `congcong-study.cn` 申请并启用 HTTPS 证书。

这些步骤会使用 `sudo` 修改生产服务器，必须由服务器管理员明确授权后执行。

## 数据备份与恢复

在服务器应用目录执行：

```bash
npm run db:backup -- --output /安全备份目录/study-plan.dump
```

恢复前先停止写入，再使用 PostgreSQL 工具：

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" study-plan.dump
```

备份至少应保留一份在服务器之外，并对备份文件设置访问控制。将生产数据库复制到
GitHub Artifact、对象存储或其他云服务之前，需要单独确认目标位置和数据权限。

仓库自带的 `Backup production PostgreSQL` 工作流会先使用 AES-256-CBC 和 PBKDF2
加密数据库转储，再上传 GitHub Artifact；仓库中不会出现明文数据库。加密口令仅保存在
GitHub Actions Secret `BACKUP_ENCRYPTION_PASSWORD` 中。下载备份后可在安全环境中解密：

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
  -in study-plan.dump.enc -out study-plan.dump \
  -pass env:BACKUP_ENCRYPTION_PASSWORD
```

解密后的文件包含生产数据，恢复结束后应立即安全删除。

## 验收

```bash
curl --fail http://127.0.0.1:3001/api/health
curl --fail --head https://congcong-study.cn
sudo systemctl is-active study-plan
```

健康接口只有在 PostgreSQL 可连接、持久化上传目录可读写时才返回 HTTP 200。
