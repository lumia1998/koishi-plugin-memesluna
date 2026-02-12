# koishi-plugin-memesluna

MemesLuna 是一个 Koishi 表情路由插件，提供：

- 表情合集管理（本地图片 / 外链）
- 端点管理（302 重定向）
- Console 管理页面入口
- ChatLuna 变量注入（`{memesluna}`）
- 路由清单命令：`memesluna.list`

## 安装

```bash
npm i koishi-plugin-memesluna
```

## 基础配置

- `backendPath`：后端路径前缀（默认 `/memesluna`）
- `storagePath`：本地表情合集目录（默认 `data/memesluna`）
- `selfUrl`：服务公开地址（为空时使用 server.selfUrl）
- `injectVariables`：是否注入 ChatLuna 变量
- `variableRefreshIntervalMs`：变量刷新间隔

## 命令

### `memesluna.list`

输出当前可用路由清单（合集 + 端点），格式例如：

```text
atri atri表情包
vrchat vrchat表情包
doro doro表情包
```

## 路由说明

默认后端路径前缀是 `/memesluna`：

- `/memesluna/`：主页
- `/memesluna/admin`：管理页入口（兼容路由）
- `/memesluna/admin/endpoint`：端点页入口（兼容路由）
- `/memesluna/:name`：合集或端点访问

## 开发

```bash
npm install
npm run typecheck
```

> 仓库不提交编译产物（`lib/`、`dist/`），发布时由本地打包产出。

## License

MIT
