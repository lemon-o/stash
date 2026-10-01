# 定制版 Stash 镜像：自动构建与客户端部署

本目录提供「开箱即用」的部署文件。镜像由 GitHub Actions 在每次推送时自动构建，
客户端只需 `docker pull` 即可部署，无需在本地准备 Go / Node 编译环境。

- 镜像地址：`ghcr.io/lemon-o/stash`
- 支持架构：`linux/amd64`、`linux/arm64`
- 流水线文件：[`.github/workflows/docker-image.yml`](../.github/workflows/docker-image.yml)

---

## 1. 一次性准备（仓库维护者必做）

GHCR 上的镜像**默认是私有的**，即使仓库本身是公开的。所以第一次构建成功后，
必须手动把镜像可见性改成公开，客户端才能免登录拉取：

1. 打开 <https://github.com/lemon-o/stash> ，右侧边栏找到 **Packages**，点进刚发布的 `stash` 包；
   （或直接访问 <https://github.com/users/lemon-o/packages/container/package/stash>）
2. 点击 **Package settings**；
3. 拉到底部 **Danger Zone** → **Change visibility** → 选择 **Public**，按提示输入包名确认。

改完之后，用一台没登录 GitHub 的机器验证：

```bash
docker pull ghcr.io/lemon-o/stash:latest
```

如果这一步报 `unauthorized` 或 `denied`，就是可见性还没改成 Public。

---

## 2. 客户端部署

### 方式 A：docker compose（推荐）

```bash
mkdir -p /opt/stash && cd /opt/stash
curl -fsSLO https://raw.githubusercontent.com/lemon-o/stash/custom-ui/deploy/docker-compose.yml
# 按需修改里面的媒体目录与端口
docker compose up -d
```

浏览器打开 `http://<服务器IP>:9999`。

### 方式 B：docker run

```bash
docker run -d \
  --name stash \
  --restart unless-stopped \
  -p 9999:9999 \
  -e STASH_STASH=/data/ \
  -e STASH_GENERATED=/generated/ \
  -e STASH_METADATA=/metadata/ \
  -e STASH_CACHE=/cache/ \
  -e STASH_PORT=9999 \
  -e TZ=Asia/Shanghai \
  -v /opt/stash/config:/root/.stash \
  -v /path/to/your/media:/data \
  -v /opt/stash/metadata:/metadata \
  -v /opt/stash/cache:/cache \
  -v /opt/stash/blobs:/blobs \
  -v /opt/stash/generated:/generated \
  ghcr.io/lemon-o/stash:latest
```

### 更新到新版本

```bash
docker compose pull && docker compose up -d
```

数据全部在挂载出来的宿主机目录里（配置与数据库在 `./config`），
换镜像、删容器都不会丢数据。

---

## 3. 可用的镜像标签

| 标签 | 触发方式 | 说明 |
| :--- | :--- | :--- |
| `latest` | 推送到 `custom-ui`、推送 `v*` 标签 | 最新的定制版，客户端一般用这个 |
| `custom-ui` | 推送到 `custom-ui` | 与 `latest` 同一次构建，语义更明确 |
| `edge` | 推送到 `custom-ui` | 同上，表示「开发中」的定制版 |
| `sha-1c38437` | 每次构建 | 固定到某个提交，适合固定版本部署 |
| `1.2.3` / `1.2` | 推送 `v1.2.3` 标签 | 正式版本号 |

---

## 4. 触发一次构建

三种方式，任选其一：

1. **推送代码**：改动合并进 `custom-ui` 分支后 `git push`，自动开始构建；
   （目前 `custom-ui` 是本仓库默认分支 `develop` 之外的分支，`push` 触发工作正常）
2. **打标签发布正式版**：
   ```bash
   git tag v1.0.0-custom && git push origin v1.0.0-custom
   ```
3. **手动触发**：打开 [Actions → Docker Image](https://github.com/lemon-o/stash/actions/workflows/docker-image.yml)，
   点 **Run workflow**，分支选 `custom-ui`，可顺便填一个自定义标签。

构建过程：两个架构在各自的运行器上并行构建 → 各自按 digest 推送 → 合并成多架构清单。
首次（无缓存）大约 20~40 分钟，之后有缓存会快很多。

---

## 5. 本地手动构建（可选）

想在本地验证镜像内容：

```bash
# 在仓库根目录执行，注意是 docker/build/x86_64/Dockerfile
docker build \
  --build-arg GITHASH=$(git rev-parse --short HEAD) \
  --build-arg STASH_VERSION=$(git describe --tags --always) \
  -t stash-local:test \
  -f docker/build/x86_64/Dockerfile .
```

或者直接用 Makefile：

```bash
make docker-build
```

---

## 6. 常见问题

**Q：`docker pull` 提示 `unauthorized` / `denied`？**
镜像还是私有可见性，按第 1 节改成 Public。

**Q：ARM 设备（树莓派、ARM 群晖、Apple Silicon）能跑吗？**
可以，镜像包含 `linux/arm64`。如果第一次构建时 arm64 那一格失败了，
流水线仍会发布只含 amd64 的镜像（日志里会有告警），请查看该作业日志。

**Q：Actions 里提示没有权限推送包？**
确认仓库的 **Settings → Actions → General → Workflow permissions** 允许读写，
或至少允许工作流使用 `packages: write`（本流水线已在文件里声明该权限）。

**Q：想给 NVIDIA 显卡加 CUDA 支持？**
仓库里已有 `docker/build/x86_64/Dockerfile-CUDA`，但它没有纳入本流水线
（CUDA 镜像体积大、构建慢）。需要的话可以在矩阵里再加一条使用该 Dockerfile 的构建。

**Q：旧镜像越积越多？**
GHCR 不会自动清理。建议只保留 `latest` 等固定标签，定期到
**Packages → stash → 版本列表** 手动删除旧的 `sha-*`。
注意：多架构镜像的各个架构是以独立版本存放的，误删会破坏清单，清理时请一次删一整组。
