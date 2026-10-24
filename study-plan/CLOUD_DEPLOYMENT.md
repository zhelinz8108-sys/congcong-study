# 聪聪学习计划：云端部署说明

## 默认交付流程

用户已授权本项目后续修改在完成相关检查后自动部署，无需再次确认。
日常修改完成后，将通过检查的代码提交并推送至 `main`，由现有 GitHub Actions
部署流程发布；跟踪本次提交对应的部署结果，确认成功后再告知用户已上线。
用户明确要求仅本地修改、保留草稿或暂不部署时，按当次要求执行。
如推送或部署受阻，应说明实际阻碍，不得将尚未上线的修改报告为已部署。

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

此前的失败暂存目录恢复只将脚本中明确列出的失败目录转存到现有数据盘的
`failed-release-archives`。转存会逐文件核对 SHA-256、权限和归属，保留完整副本，
并用原路径的符号链接指向副本。先确认目录不属于当前应用且相关进程已停止；
配置、依赖和构建一并保留在私有归档目录中。媒体和上传文件的链接按原样保留，
链接指向的文件不参与复制或清理。
转存后仍须为数据盘保留 10 GiB，并在上传新代码后满足系统盘 4 GiB 的构建余量。
若仍不足，只将 `ubuntu` 的 npm 依赖下载缓存按相同校验流程转存，保留原路径链接，
后续下载缓存写入数据盘；不迁移已安装的依赖或当前运行的应用。
SSH 每 15 秒发送保活消息，转存程序每 20 秒输出不含文件内容的进度。
断线后重试先等待原任务释放发布锁，再核对已完成的副本并恢复原路径链接；
未完成的复制保留为 `.interrupted-*`，从完整原目录重新复制。
只有核对一致的重复文件才会从系统盘释放；内容不一致时保留双方并停止。

2026-10-20 的空间恢复另保留转存了最旧的历史回滚副本：
`/www/study-plan-releases/previous-bc29df1082b44e9b4ae1eacd813dd542761a3fbb-38966819559-1`。
完整副本保存在 `/www/study-plan-data/retained-release-archives/` 下的同名目录，
原路径保留符号链接，同名 `.json` 收据记录完整文件清单的 SHA-256。
转存前核对成功发布收据、旧版本 BUILD_ID、当前版本和最近回滚版本，并排除运行中的进程。
文件、权限、归属及链接全部校验一致后才释放系统盘上的重复副本；数据盘保留至少 10 GiB。
当前应用、最近回滚版本、学习记录、数据库备份、上传文件和独立维护媒体均保留。
手动恢复这份较早版本时，应先从数据盘完整复制到独立的系统盘目录并校验，再按回滚流程切换；
不要把归档符号链接直接当作可原子切换的生产目录。

`scripts/archive-retained-release.py --apply` 用于另一个已经核对发布收据和容量的
固定候选：`previous-062fb81fcbc09f1af719e297991e0e2760045e6d-38992301286-1`。
它与同目录的 `archive-failed-release-stages.py` 配套使用，不能传入其他目录。
工具核对当前版本和最新成功收据、保留最近回滚副本、检查进程及当前应用链接，
并在现有发布锁内完整复制和校验；释放原盘重复文件前再次检查引用与数据盘余量。
建议通过独立 systemd 临时服务运行，避免 SSH 断线中止复制。迁移后原路径保留链接，
仍须按上文流程将副本恢复到独立系统盘目录后才能用于回滚。
这段说明记录工具用途，不代表候选已经迁移；以服务器执行结果和磁盘检查为准。

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
