#!/bin/bash
# TaishanXD — Claude Code 环境切换器
set -euo pipefail

SETTINGS="$HOME/.claude/settings.json"

if [[ ! -f "$SETTINGS" ]]; then
    echo "❌ 未找到 $SETTINGS"
    exit 1
fi

cat << 'BANNER'
 ________          __   ______   __                           
|        \        |  \ /      \ |  \                          
 \$$$$$$$$______   \$$|  $$$$$$\| $$____    ______   _______  
   | $$  |      \ |  \| $$___\$$| $$    \  |      \ |       \ 
   | $$   \$$$$$$\| $$ \$$    \ | $$$$$$$\  \$$$$$$\| $$$$$$$\
   | $$  /      $$| $$ _\$$$$$$\| $$  | $$ /      $$| $$  | $$
   | $$ |  $$$$$$$| $$|  \__| $$| $$  | $$|  $$$$$$$| $$  | $$
   | $$  \$$    $$| $$ \$$    $$| $$  | $$ \$$    $$| $$  | $$
    \$$   \$$$$$$$ \$$  \$$$$$$  \$$   \$$  \$$$$$$$ \$$   \$$
                                                              
                                                              
                                                              
BANNER

echo ""
echo "  请选择 Claude Code 环境："
echo ""
echo "    1) DeepSeek v4-pro"
echo "    2) Qwen3.6 (DashScope)"
echo "    3) Kimi for Coding"
echo "    4) (待配置)"
echo ""
read -r -p "  请输入编号 [1-4]: " CONFIG

[[ "$CONFIG" =~ ^[1-4]$ ]] || { echo "  无效选择，退出"; exit 1; }

case "$CONFIG" in
    1)
        ENV_JSON=$(cat << 'JSON'
{
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-2a57f0e27d6b46259ce222383f94bf4c",
    "ANTHROPIC_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash",
    "CLAUDE_CODE_SUBAGENT_MODEL": "deepseek-v4-flash",
    "CLAUDE_CODE_EFFORT_LEVEL": "max"
}
JSON
)
        LABEL="DeepSeek v4-pro"
        ;;
    2)
        ENV_JSON=$(cat << 'JSON'
{
    "ANTHROPIC_BASE_URL": "https://dashscope.aliyuncs.com/apps/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-9534d76154e2435aabdb15eba0e347ca",
    "ANTHROPIC_MODEL": "qwen3.6-plus",
    "ANTHROPIC_SMALL_FAST_MODEL": "qwen3.6-plus",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen3.6-plus",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen3.6-plus",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "qwen3.6-flash",
    "CLAUDE_CODE_SUBAGENT_MODEL": "qwen3.6-flash"
}
JSON
)
        LABEL="Qwen3.6 (DashScope)"
        ;;
    3)
        ENV_JSON=$(cat << 'JSON'
{
    "ANTHROPIC_BASE_URL": "https://api.kimi.com/coding/",
    "ANTHROPIC_AUTH_TOKEN": "sk-kimi-gPWxknoyZGNkebSJFMNNvISzVbyn2aICb2rBoZmJ69315XhSkilbaB8nGybikp1p",
    "ANTHROPIC_MODEL": "kimi-for-coding",
    "ANTHROPIC_SMALL_FAST_MODEL": "kimi-for-coding",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "kimi-for-coding",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-for-coding",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "kimi-for-coding",
    "CLAUDE_CODE_SUBAGENT_MODEL": "kimi-for-coding"
}
JSON
)
        LABEL="Kimi for Coding"
        ;;
    4)
        ENV_JSON="{}"
        LABEL="配置 4 (待配置)"
        ;;
esac

python3 - "$SETTINGS" "$ENV_JSON" "$LABEL" << 'PYEOF'
import sys, json

path = sys.argv[1]
new_env = json.loads(sys.argv[2])
label = sys.argv[3]

with open(path, 'r') as f:
    cfg = json.load(f)

known_prefixes = (
    "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_SMALL_FAST_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_EFFORT_LEVEL"
)
env = cfg.setdefault("env", {})
for k in known_prefixes:
    env.pop(k, None)

env.update(new_env)

with open(path, 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f"\n  ✅ 已切换到 {label}\n")
PYEOF
