# 这是 lemon-o/stash 定制分支专用的构建文件，内容基于上游
# docker/build/x86_64/Dockerfile，共做了两处必要修改，方便日后与上游同步。
#
# 【差异 1】前端阶段固定 pnpm 版本
#   上游：RUN npm install -g pnpm
#   这里：RUN npm install -g pnpm@10.33.0
#
#   原因：不锁定版本时 npm 会装到最新版 pnpm（当前是 12.x，依赖原生包 @pnpm/exe.*）。
#   该版本启动后会读取 ui/v2.5/package.json 的 packageManager 字段并"自动切换"到
#   pnpm@10.33.0，而 @pnpm/exe@10.33.0 没有发布 linux-x64-musl（Alpine 用的 libc）
#   原生二进制，于是构建报错：
#       ERR_PNPM_PNPM_ENGINE_NO_NATIVE_BINARY
#       Cannot run @pnpm/exe@10.33.0 on this host: it ships no native binary for linux-x64-musl.
#
#   而 pnpm@10.33.0 本身是纯 JavaScript 实现（bin/pnpm.cjs，无原生依赖），在 Alpine 上
#   可直接运行；又因为版本与 packageManager 完全一致，也不会再触发任何版本切换。
#
#   升级 pnpm 时：请同步修改这里和 ui/v2.5/package.json 的 packageManager 字段。
#
# 【差异 2】运行时阶段补齐官方发布镜像的依赖
#   上游 docker/build/x86_64/Dockerfile 的最终阶段只装了
#   ca-certificates vips-tools ffmpeg，而官方**发布**镜像用的是另一份文件
#   docker/ci/x86_64/Dockerfile，它额外安装了 python3 系列、tzdata、vips-heif。
#   直接照搬前者会缺功能：
#     - Python 社区刮削器无法运行（社区刮削器绝大多数是 Python 写的）
#     - Alpine 基础镜像不带时区库，TZ 环境变量会被忽略，时间全按 UTC 走
#     - HEIF/HEIC 图片无法处理
#   所以这里改为与官方发布镜像一致的依赖集合，保证可以无缝替换官方镜像。
#
# 【构建方式】在仓库根目录执行：
#   docker build -f docker/build/custom/Dockerfile \
#     --build-arg GITHASH=$(git rev-parse --short HEAD) \
#     --build-arg STASH_VERSION=$(git describe --tags --always) \
#     -t stash-custom .

# Build Frontend
FROM node:24-alpine AS frontend
RUN apk add --no-cache make git
## cache node_modules separately
COPY ./ui/v2.5/package.json ./ui/v2.5/pnpm-lock.yaml /stash/ui/v2.5/
WORKDIR /stash
COPY Makefile /stash/
COPY ./graphql /stash/graphql/
COPY ./ui /stash/ui/
# 版本必须与 ui/v2.5/package.json 的 packageManager 一致，详见文件头部说明
RUN npm install -g pnpm@10.33.0
RUN make pre-ui
RUN make generate-ui
ARG GITHASH
ARG STASH_VERSION
RUN BUILD_DATE=$(date +"%Y-%m-%d %H:%M:%S") make ui-only

# Build Backend
FROM golang:1.25.9-alpine AS backend
RUN apk add --no-cache make alpine-sdk
WORKDIR /stash
COPY ./go* ./*.go Makefile gqlgen.yml .gqlgenc.yml /stash/
COPY ./graphql /stash/graphql/
COPY ./scripts /stash/scripts/
COPY ./pkg /stash/pkg/
COPY ./cmd /stash/cmd/
COPY ./internal /stash/internal/
# needed for generate-login-locale
COPY ./ui /stash/ui/
RUN make generate-backend generate-login-locale
COPY --from=frontend /stash /stash/
ARG GITHASH
ARG STASH_VERSION
RUN make flags-release flags-pie stash

# Final Runnable Image
# 依赖集合与官方发布镜像（docker/ci/x86_64/Dockerfile）保持一致，见文件头部差异 2
FROM alpine:latest
RUN apk add --no-cache \
      ca-certificates \
      python3 \
      py3-requests \
      py3-requests-toolbelt \
      py3-lxml \
      py3-pip \
      ffmpeg \
      tzdata \
      vips \
      vips-tools \
      vips-heif \
    && pip install --break-system-packages mechanicalsoup cloudscraper stashapp-tools

COPY --from=backend /stash/stash /usr/bin/
COPY ./pkg/plugin/builtin/ /root/.stash/plugins/
ENV STASH_CONFIG_FILE=/root/.stash/config.yml
LABEL org.opencontainers.image.title="Stash (customised)" \
    org.opencontainers.image.description="Stash with a monochrome dark UI and a Chinese in-app manual, built from lemon-o/stash." \
    org.opencontainers.image.url="https://github.com/lemon-o/stash" \
    org.opencontainers.image.documentation="https://github.com/lemon-o/stash/blob/custom-ui/README.md" \
    org.opencontainers.image.source="https://github.com/lemon-o/stash" \
    org.opencontainers.image.licenses="AGPL-3.0"
EXPOSE 9999
ENTRYPOINT ["stash"]
