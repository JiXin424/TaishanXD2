#!/bin/bash
# test-model.sh - 快速测试 LLM 分析服务连通性及模型配置
# 用法: ./test-model.sh [service_url]
# 示例: ./test-model.sh http://localhost:8000

set -e

SERVICE_URL="${1:-http://localhost:8000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

echo "========================================="
echo " LLM 分析服务 - 模型连通性测试"
echo "========================================="
echo ""

# --------------------------------------------------
# 1. 读取 .env 配置
# --------------------------------------------------
info "检查 .env 配置..."

if [ ! -f "$ENV_FILE" ]; then
    fail ".env 文件不存在: $ENV_FILE"
    exit 1
fi

MODEL=$(grep -E '^DASHSCOPE_MODEL=' "$ENV_FILE" | cut -d'=' -f2)
API_KEY=$(grep -E '^DASHSCOPE_API_KEY=' "$ENV_FILE" | cut -d'=' -f2)
BASE_URL=$(grep -E '^DASHSCOPE_BASE_URL=' "$ENV_FILE" | cut -d'=' -f2)

if [ -z "$MODEL" ]; then
    fail "DASHSCOPE_MODEL 未配置"
    exit 1
fi

if [ -z "$API_KEY" ] || [ "$API_KEY" = "sk-your-api-key-here" ]; then
    fail "DASHSCOPE_API_KEY 未配置或为默认值"
    exit 1
fi

ok "当前配置模型: $MODEL"
ok "API Base URL:  $BASE_URL"
ok "API Key:       ${API_KEY:0:8}...${API_KEY: -4}"
echo ""

# --------------------------------------------------
# 2. 健康检查
# --------------------------------------------------
info "检查服务健康状态 ($SERVICE_URL/health)..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" 2>/dev/null) || true

if [ "$HTTP_CODE" = "200" ]; then
    ok "服务运行正常 (HTTP $HTTP_CODE)"
else
    fail "服务不可达 (HTTP $HTTP_CODE)"
    info "请确认容器已启动: cd llm-analysis-service && docker compose up -d --build"
    exit 1
fi
echo ""

# --------------------------------------------------
# 3. 直接调用 DashScope API 验证模型可用性
# --------------------------------------------------
info "直接调用 DashScope API 验证模型 [$MODEL]..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$BASE_URL/chat/completions" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"model\": \"$MODEL\",
        \"messages\": [{\"role\": \"user\", \"content\": \"请用一句话介绍你自己，并说明你的模型名称。\"}],
        \"temperature\": 0.1,
        \"max_tokens\": 200
    }" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    ok "DashScope API 调用成功 (HTTP $HTTP_CODE)"

    # 提取模型回复
    REPLY=$(echo "$BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data['choices'][0]['message']['content'])
    if 'model' in data:
        print('---META---')
        print('实际调用模型:', data['model'])
        print('Token用量:', json.dumps(data.get('usage', {})))
except Exception as e:
    print('解析失败:', e)
" 2>/dev/null)

    if [ $? -eq 0 ]; then
        CONTENT=$(echo "$REPLY" | sed '/^---META---$/,$d')
        META=$(echo "$REPLY" | sed -n '/^---META---$/,$p' | tail -n +2)

        echo ""
        info "模型回复:"
        echo -e "${YELLOW}$CONTENT${NC}"
        if [ -n "$META" ]; then
            echo ""
            info "元信息:"
            echo -e "  $META"
        fi
    else
        echo -e "  原始响应: ${YELLOW}$(echo "$BODY" | head -c 300)${NC}"
    fi
else
    fail "DashScope API 调用失败 (HTTP $HTTP_CODE)"
    echo -e "  响应: ${YELLOW}$(echo "$BODY" | head -c 500)${NC}"
    echo ""
    info "可能原因:"
    echo "  1. 模型名称 '$MODEL' 不存在，检查是否拼写正确"
    echo "  2. API Key 无权访问该模型"
    echo "  3. 账户余额不足"
    echo ""
    echo "  可用模型列表: https://help.aliyun.com/zh/model-studio/getting-started/models"
fi

echo ""
echo "========================================="
echo " 测试完成"
echo "========================================="
