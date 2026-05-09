---
name: Swagger 注解要求
description: 所有新增 API 接口必须加 Swagger 注解并重新生成文档，确保 /swagger/index.html 能看到
type: feedback
---

所有新增 API 接口必须：
1. 在 handler 函数上加完整的 Swagger godoc 注解（Summary、Description、Tags、Param、Success、Router）
2. 运行 `swag init -g cmd/server/main.go -o docs/` 重新生成文档
3. 重新构建部署后验证 /swagger/index.html 包含新接口

**Why:** 用户依赖 Swagger UI 做接口测试，新接口不在 Swagger 上会导致无法测试
**How to apply:** 每次新增或修改 API handler 时，同步添加/更新 Swagger 注解，然后执行 swag init
