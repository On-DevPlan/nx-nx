# 开发入口都收在这里：make 的名字比记一长串命令可靠。
# .PHONY 是必需的——否则目录同名时 make 会认为「已经是最新」而不执行。
.PHONY: help tidy run build build-web dao fmt check up down logs psql clean

APP       := {{name}}
MODULE    := {{goModule}}
ENTRY     := ./app/server
BIN       := bin/{{name}}

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

tidy: ## 拉取/整理 Go 依赖（首次必跑，会生成 go.sum）
	go mod tidy

run: ## 本机起 Go API（读 manifest/config/config.yaml）
	go run $(ENTRY)

build: ## 编译 Go 二进制到 bin/
	go build -trimpath -ldflags "-s -w -X '$(MODULE)/app/server/internal/consts.Version={{version}}'" -o $(BIN) $(ENTRY)

build-web: ## 构建前端产物到 web/dist
	cd web && npm install --no-audit --no-fund && npm run build

dao: ## 按现有库表结构生成 dao/do/entity（读 hack/config.yaml）
	gf gen dao -c hack/config.yaml

fmt: ## 格式化（写回）
	gofmt -w app

check: ## 提交前的廉价闸门：格式 + 编译 + 前端类型检查
	@test -z "$$(gofmt -l app)" || (echo "以下文件需要 gofmt：" && gofmt -l app && exit 1)
	go build ./...
	cd web && npm run typecheck

up: ## 起整栈（pg + api + web）
	docker compose up -d --build

down: ## 停整栈（保留数据卷）
	docker compose down

logs: ## 跟踪 api 日志
	docker compose logs -f api

psql: ## 进数据库
	docker compose exec pg psql -U {{pgUser}} -d {{pgDatabase}}

clean: ## 删本地构建产物与日志（不动数据库）
	rm -rf bin/ tmp/ temp/ web/dist
