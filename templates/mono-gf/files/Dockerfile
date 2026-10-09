# Go 后端镜像：多阶段构建，最终镜像里只有静态二进制与配置。
#
# CGO_ENABLED=0：不依赖 libc，可以跑在 alpine/scratch 上，也让交叉编译变得简单。
# 基础镜像版本要 >= go.mod 里的 go 指令（低了会在构建时报「requires go >= 1.23」）。
FROM golang:1.23-alpine AS build
WORKDIR /src

# 先拷 go.mod / go.sum 再 download：依赖没变时这一层命中缓存，
# 后面每次改业务代码都不用重新拉依赖。
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X '{{goModule}}/app/server/internal/consts.Version={{version}}'" \
    -o /out/app ./app/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=build /out/app /app/app
# 容器内用的配置（compose 会把它挂载覆盖成 config.yaml）
COPY manifest/config/config.docker.yaml /app/manifest/config/config.docker.yaml

EXPOSE {{apiPort}}
ENTRYPOINT ["/app/app"]
