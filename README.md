# aichat
一个简单的命令行ai agent，快速和 ai 对话并得到结果

## Usage

```bash
bun install
bun run build
./dist/ai --config
./dist/ai 今天天气怎么样
```

默认配置路径为 `~/.config/aichat/aichat.json`，默认上下文路径为
`~/.aichat/sessions/default.json`。上下文最多保留 100 条消息。

```bash
ai --clean
ai --config --set provider.baseURL=https://api.deepseek.com --set provider.model=deepseek-v4-pro
```

MCP server 和本机 skills 都通过配置加载。Bash 工具默认只自动批准
`tvly *`，其他命令会在终端确认后执行。
