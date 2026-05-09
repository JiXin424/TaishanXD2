"""
engine.py - LLM 分析引擎核心逻辑

负责 Prompt 组装、大模型调用、JSON 解析与异常兜底、结果持久化。
生成六段式分析报告，匹配前端报告模板结构。
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import concurrent.futures
from typing import Any, Optional

from dotenv import load_dotenv
from openai import APITimeoutError, AuthenticationError, RateLimitError, APIStatusError, OpenAI
import psycopg2
from psycopg2.extras import Json as PgJson

from models import AnalysisRequest, AnalysisReport

# 加载 .env 环境变量
load_dotenv()

logger = logging.getLogger(__name__)

# ============================================================
# OpenAI 客户端初始化（兼容 DashScope）
# ============================================================

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """懒加载 OpenAI 客户端单例"""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.getenv("DASHSCOPE_API_KEY", ""),
            base_url=os.getenv(
                "DASHSCOPE_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            ),
            max_retries=0,
        )
    return _client


# ============================================================
# PostgreSQL 连接
# ============================================================

def _get_pg_conn():
    """获取 PostgreSQL 连接"""
    return psycopg2.connect(
        host=os.getenv("PG_HOST", "localhost"),
        port=int(os.getenv("PG_PORT", "5432")),
        dbname=os.getenv("PG_DBNAME", "dify"),
        user=os.getenv("PG_USER", "postgres"),
        password=os.getenv("PG_PASSWORD", ""),
    )


def _save_result(
    request: AnalysisRequest,
    report: AnalysisReport,
    success: bool,
    error_msg: Optional[str],
) -> Optional[int]:
    """将分析结果持久化到 llm_analysis_log 表"""
    sql = """
        INSERT INTO llm_analysis_log
            (app_id, company_id, analysis_target, data_count,
             core_intents, quality_issues, summary, success, error_msg, full_report, time_range_type)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """
    try:
        conn = _get_pg_conn()
        with conn:
            with conn.cursor() as cur:
                # 从报告中提取摘要信息
                intents = [c.name for c in report.categories]
                issues = [p.title for p in report.common_patterns]
                summary_parts = []
                if report.spotlight:
                    summary_parts.append(report.spotlight.title)
                for ins in report.key_insights[:3]:
                    summary_parts.append(ins.title)
                summary = "；".join(summary_parts) if summary_parts else report.header.core_scenario

                # 完整报告 JSON
                full_report_json = PgJson(report.model_dump())

                cur.execute(sql, (
                    request.app_id,
                    request.company_id,
                    request.analysis_target,
                    len(request.data_list),
                    PgJson(intents),
                    PgJson(issues),
                    summary,
                    success,
                    error_msg,
                    full_report_json,
                    request.time_range or "week",
                ))
                row_id = cur.fetchone()[0]
        conn.close()
        logger.info("分析结果已持久化，id=%s", row_id)
        return row_id
    except Exception as e:
        logger.error("持久化分析结果失败: %s", e, exc_info=True)
        return None


def get_analysis_history(
    app_id: str,
    company_id: int,
    limit: int = 20,
) -> list[dict]:
    """查询指定应用的分析历史记录"""
    sql = """
        SELECT id, app_id, analysis_target, data_count,
               core_intents, quality_issues, summary,
               success, created_at
        FROM llm_analysis_log
        WHERE app_id = %s AND company_id = %s
        ORDER BY created_at DESC
        LIMIT %s
    """
    try:
        conn = _get_pg_conn()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (app_id, company_id, limit))
                columns = [desc[0] for desc in cur.description]
                rows = [dict(zip(columns, row)) for row in cur.fetchall()]
        conn.close()
        for row in rows:
            if row.get("created_at"):
                row["created_at"] = str(row["created_at"])
            for key in ("core_intents", "quality_issues"):
                val = row.get(key)
                if isinstance(val, str):
                    row[key] = json.loads(val)
        return rows
    except Exception as e:
        logger.error("查询分析历史失败: %s", e, exc_info=True)
        return []


# ============================================================
# Prompt 组装
# ============================================================

_SYSTEM_PROMPT = """你是一个专业的 AI 工具使用分析专家。你的任务是分析用户与 AI 工具的对话日志，生成一份结构化的使用分析报告。

重要规则：
- **usage_ranking、person_breakdown、summary_table 必须包含输入数据中的每一个用户，不得遗漏或只取 Top N**。如果输入有 N 个用户，这三个数组的长度必须都是 N
- 当用户没有真实姓名时（user_name 为空或只有 user_id），在报告中使用 user_id 或昵称（如"用户 A"）来标识，不要编造"企业用户 A"这样的名称
- 所有用户标识必须基于输入数据，不要虚构人名
- **校验**：`header.active_members` 的值必须与 `usage_ranking` 数组的长度完全一致

你必须严格按照以下 JSON 格式返回结果，不要添加任何其他文字。JSON 结构如下：

{
  "header": {
    "total_conversations": 数字,
    "active_members": 数字,
    "covered_days": "如 2天",
    "core_scenario": "最核心的使用场景描述"
  },
  "usage_ranking": [
    {
      "user_name": "用户姓名",
      "user_id": "用户ID",
      "count": 提问数量,
      "note": "补充说明"
    }
  ],
  "categories": [
    {
      "icon": "emoji图标",
      "name": "分类名称",
      "count": "如 ~5条",
      "description": "详细说明，用 \\n 换行",
      "who": "涉及：张三（记录1-3）、李四（记录5-7）"
    }
  ],
  "common_patterns": [
    {
      "badge": "如 2人共同关注",
      "badge_type": "info 或 warn",
      "title": "共性问题标题",
      "detail": "详细分析",
      "who": "涉及人员及各自角度"
    }
  ],
  "spotlight": {
    "title": "核心用户深度解析标题",
    "text": "深度分析文字"
  },
  "person_breakdown": [
    {
      "user_name": "姓名",
      "user_id": "用户ID",
      "count": 提问数,
      "tags": [
        {"label": "标签文字", "color": "blue/orange/red/purple/green"}
      ],
      "description": "使用模式分析",
      "repeat_analysis": {
        "text": "重复/递进问题分析"
      }
    }
  ],
  "key_insights": [
    {
      "icon": "emoji",
      "title": "发现标题",
      "text": "详细说明"
    }
  ],
  "summary_table": [
    {
      "user_name": "姓名",
      "user_id": "用户ID",
      "count": 提问量,
      "effectiveness": "如 ~90%",
      "focus_areas": "主要关注领域",
      "repetition": "重复性评价",
      "maturity": "如 ⭐⭐⭐⭐"
    }
  ]
}

分析要点：
1. usage_ranking：**必须包含所有用户（一个都不能少），按提问数量从高到低排列**
2. categories：将所有对话按主题/场景分类（4-6 类），每类给出数量估算和涉及人员
3. common_patterns：找出多人共同关注的问题或隐性风险（2-4 个）
4. spotlight：选出最活跃/最有代表性的一个用户做深度分析（如果没有突出用户可省略）
5. person_breakdown：**每个用户都必须有独立分析**其使用模式、关注领域和重复性
6. key_insights：3-6 个值得关注的发现（使用特征、效率问题、改进建议等）
7. summary_table：**每个用户都必须有一行汇总**

注意：
- 在 usage_ranking、person_breakdown、summary_table 中必须保留 user_id 字段，值与输入数据中的 user_id 一致
- **这三个数组的长度必须相等，且等于输入数据中的用户总数**
- categories 的 who 字段格式为"涉及：姓名（记录号）、姓名（记录号）"，不要在 who 中重复罗列人名
- 分析要基于数据，有具体的引用和证据
- 评价要客观，既指出亮点也指出问题
- 文字要精炼，避免空话套话
- 所有 emoji 使用合适的符号
"""


# ============================================================
# Map-Reduce 分析配置
# ============================================================

_BATCH_CONCURRENCY = 3
_BATCH_DELAY = 2  # 批次间隔（秒），避免触发 DashScope 限流
_MAX_AI_REPLY_PER_USER = 200

_PER_USER_SYSTEM_PROMPT = """你是 AI 工具使用分析专家。分析以下用户的所有对话记录，提取结构化摘要。
严格按 JSON 格式返回，不要添加任何其他文字：

{
  "topics": [
    {"name": "主题/场景名称", "count": 对话数量, "samples": ["1-2个代表性用户问题"]}
  ],
  "usage_pattern": "使用模式描述（什么时候用、怎么用、用得好不好）",
  "repeat_analysis": "是否有重复提问或递进深入的问题，具体说明",
  "effectiveness": "使用有效率估算（如 ~85%）",
  "maturity": "使用成熟度（⭐⭐⭐ 格式，1-5星）",
  "tags": ["2-3个标签描述使用特征"],
  "focus_areas": "主要关注领域（逗号分隔）",
  "summary": "一句话总结该用户的使用特征和典型行为"
}

注意：
- topics 应覆盖该用户的主要对话主题（2-5个）
- tags 使用简短关键词（如"高频用户"、"重复提问"、"深度探索"）
- 评价要客观，基于对话内容"""


def _truncate_ai_reply(text: str) -> str:
    if not text:
        return ""
    if len(text) <= _MAX_AI_REPLY_PER_USER:
        return text
    return text[:_MAX_AI_REPLY_PER_USER] + "...（已截断）"


def _analyze_single_user(client, model, user_id, user_name, items):
    """分析单个用户的所有对话，返回结构化摘要 dict（失败自动重试 1 次）。"""
    prompt_lines = [f"## 用户：{user_name or user_id}\n## 对话数量：{len(items)}\n"]
    for i, item in enumerate(items, 1):
        prompt_lines.append(f"### 对话 {i}")
        prompt_lines.append(f"- 时间：{item.time}")
        prompt_lines.append(f"- 用户输入：{item.dialogue.user}")
        prompt_lines.append(f"- AI 回复：{_truncate_ai_reply(item.dialogue.ai)}")
        prompt_lines.append("")

    user_prompt = "\n".join(prompt_lines)

    for attempt in range(2):
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _PER_USER_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
                timeout=120.0,
                stream=True,
            )

            chunks = []
            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    chunks.append(delta.content)

            raw = "".join(chunks)
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("用户 %s 摘要 JSON 解析失败", user_id)
                return {
                    "topics": [], "usage_pattern": "", "repeat_analysis": "",
                    "effectiveness": "~50%", "maturity": "⭐⭐", "tags": [],
                    "focus_areas": "", "summary": raw[:200] if raw else "解析失败",
                }
        except Exception as e:
            if attempt == 0:
                logger.warning("用户 %s 分析失败，2s 后重试: %s", user_id, type(e).__name__)
                time.sleep(2)
            else:
                raise


def _group_by_user(data_list):
    """按 user_id 分组对话数据"""
    groups = {}
    for item in data_list:
        uid = item.user_id or "unknown"
        if uid not in groups:
            groups[uid] = {"name": item.user_name, "items": []}
        groups[uid]["items"].append(item)
    return groups


def _build_synthesis_prompt(request, user_stats):
    """从各用户摘要构建最终合成 Prompt"""
    total = sum(u["count"] for u in user_stats)
    members = len(user_stats)

    lines = [f"## 分析任务\n"]
    if request.app_name:
        lines[0] += f"应用：{request.app_name}\n"
    lines[0] += f"{request.analysis_target}\n"

    if request.date_range:
        lines.append(f"\n## 时间范围\n{request.date_range}\n")

    lines.append(f"\n## 全局统计\n- 总对话数：{total}\n- 活跃成员：{members}\n")

    lines.append("\n## 各用户分析摘要\n")
    for i, u in enumerate(user_stats, 1):
        uid = u.get("user_id", f"unknown_{i}")
        name = u.get("user_name") or uid
        lines.append(f"### 用户 {i}：{name}（user_id: {uid}，{u['count']} 条对话）")
        s = u.get("summary")
        if s:
            lines.append(f"- 总结：{s}")
        topics = u.get("topics", [])
        if topics:
            t_strs = [f"{t.get('name', '?')}({t.get('count', '?')}条)" for t in topics]
            lines.append(f"- 主要话题：{', '.join(t_strs)}")
        for key in ("usage_pattern", "repeat_analysis", "effectiveness", "maturity", "focus_areas"):
            val = u.get(key)
            if val:
                label = {"usage_pattern": "使用模式", "repeat_analysis": "重复问题",
                         "effectiveness": "使用效率", "maturity": "成熟度",
                         "focus_areas": "关注领域"}.get(key, key)
                lines.append(f"- {label}：{val}")
        tags = u.get("tags", [])
        if tags:
            lines.append(f"- 标签：{', '.join(tags)}")
        lines.append("")

    return "\n".join(lines)


# ============================================================
# LLM 调用
# ============================================================

def _call_llm(user_prompt: str) -> str:
    """调用大模型 API（流式传输，避免长连接被服务端断开）"""
    client = _get_client()
    model = os.getenv("DASHSCOPE_MODEL", "qwen-plus")

    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
        timeout=500.0,
        stream=True,
    )

    chunks = []
    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            chunks.append(delta.content)

    return "".join(chunks)


# ============================================================
# JSON 解析（三级降级）
# ============================================================

def _empty_report() -> AnalysisReport:
    """空兜底报告"""
    return AnalysisReport(
        header={"total_conversations": 0, "active_members": 0, "covered_days": "", "core_scenario": ""},
        usage_ranking=[],
        categories=[],
        common_patterns=[],
        spotlight=None,
        person_breakdown=[],
        key_insights=[],
        summary_table=[],
    )


_JSON_EXTRACT_PATTERN = re.compile(r"```(?:json)?\s*\n?(.*?)\n?\s*```", re.DOTALL)


def _parse_llm_output(raw: str) -> AnalysisReport:
    """三级降级解析 LLM 输出为 AnalysisReport"""
    # 第一级：直接解析
    try:
        data = json.loads(raw)
        return AnalysisReport(**data)
    except (json.JSONDecodeError, Exception):
        pass

    # 第二级：正则提取
    match = _JSON_EXTRACT_PATTERN.search(raw)
    if match:
        try:
            data = json.loads(match.group(1).strip())
            return AnalysisReport(**data)
        except (json.JSONDecodeError, Exception):
            pass

    # 第三级：兜底
    logger.warning("LLM 输出无法解析为 JSON，返回兜底结果。原始输出: %s", raw[:200])
    return _empty_report()


# ============================================================
# 公共入口
# ============================================================

def _classify_error(exc: Exception) -> str:
    """将异常分类为用户友好的中文错误提示"""
    if isinstance(exc, AuthenticationError):
        return "大模型 API 认证失败：API Key 无效或已过期，请联系管理员检查配置"
    if isinstance(exc, RateLimitError):
        body = str(exc)
        if "quota" in body.lower() or "insufficient" in body.lower() or "余额" in body:
            return "大模型 API 额度不足（账户余额耗尽或已超出配额），请联系管理员充值"
        return "大模型 API 调用频率超限，请稍后重试"
    if isinstance(exc, APITimeoutError):
        return "大模型调用超时（500s），数据量过大或服务繁忙，请稍后重试"
    if isinstance(exc, APIStatusError):
        code = getattr(exc, "status_code", None)
        if code == 401:
            return "大模型 API 认证失败：API Key 无效或已过期"
        if code == 402 or code == 403:
            return "大模型 API 额度不足或无权限，请联系管理员"
        if code == 429:
            return "大模型 API 调用频率超限，请稍后重试"
        if code and code >= 500:
            return f"大模型服务端异常（HTTP {code}），请稍后重试"
        return f"大模型 API 调用失败（HTTP {code}）：{exc.message[:100]}"
    if isinstance(exc, psycopg2.OperationalError):
        return "数据库连接失败，请检查数据库服务是否正常"
    return f"分析过程异常：{type(exc).__name__}"


def _run_user_phase(client, model, data_list):
    """Phase 1: 按用户分组并发分析，返回 (summaries_dict, user_stats_list)"""
    groups = _group_by_user(data_list)
    all_uids = list(groups.keys())
    total = len(all_uids)
    summaries = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=_BATCH_CONCURRENCY) as executor:
        for batch_start in range(0, total, _BATCH_CONCURRENCY):
            batch = all_uids[batch_start:batch_start + _BATCH_CONCURRENCY]
            futures = {
                executor.submit(
                    _analyze_single_user, client, model,
                    uid, groups[uid]["name"], groups[uid]["items"],
                ): uid
                for uid in batch
            }
            for future in concurrent.futures.as_completed(futures):
                uid = futures[future]
                try:
                    summaries[uid] = future.result()
                except Exception as e:
                    logger.error("用户 %s 分析失败: %s", uid, e)
                    summaries[uid] = {
                        "topics": [], "usage_pattern": "", "repeat_analysis": "",
                        "effectiveness": "~50%", "maturity": "⭐⭐", "tags": [],
                        "focus_areas": "", "summary": f"分析失败: {type(e).__name__}",
                    }
            # 批次间隔，避免触发限流
            if batch_start + _BATCH_CONCURRENCY < total:
                time.sleep(_BATCH_DELAY)
    for uid in all_uids:
        g = groups[uid]
        user_stats.append({
            "user_id": uid,
            "user_name": g["name"] or uid,
            "count": len(g["items"]),
            **summaries.get(uid, {}),
        })
    user_stats.sort(key=lambda x: x["count"], reverse=True)

    return summaries, user_stats


def analyze(request: AnalysisRequest) -> tuple[AnalysisReport, bool, Optional[str], Optional[int]]:
    """完整分析流程（Map-Reduce）：分组分析 → 合成报告 → 持久化"""
    success = True
    error_msg = None
    report = None
    t0 = time.time()

    try:
        client = _get_client()
        model = os.getenv("DASHSCOPE_MODEL", "qwen-plus")

        logger.info("开始 Map-Reduce 分析 app_id=%s data_count=%d",
                     request.app_id, len(request.data_list))

        # Phase 1: 各用户分析
        summaries, user_stats = _run_user_phase(client, model, request.data_list)

        # Phase 2: 合成最终报告
        synthesis_prompt = _build_synthesis_prompt(request, user_stats)
        raw_output = _call_llm(synthesis_prompt)
        report = _parse_llm_output(raw_output)

        if request.coverage_display:
            report.header.covered_days = request.coverage_display

        if report.header.total_conversations == 0 and not report.usage_ranking:
            success = False
            error_msg = "LLM 返回空报告，可能是数据不足或模型未能理解输入"

    except (AuthenticationError, RateLimitError, APITimeoutError, APIStatusError, psycopg2.OperationalError) as e:
        logger.error("LLM 分析异常 [%s]: %s", type(e).__name__, e)
        report = _empty_report()
        success = False
        error_msg = _classify_error(e)

    except Exception as e:
        logger.error("LLM 分析过程异常: %s", e, exc_info=True)
        report = _empty_report()
        success = False
        error_msg = _classify_error(e)

    elapsed = time.time() - t0
    logger.info("分析完成 app_id=%s data_count=%d 耗时=%.1fs success=%s",
                request.app_id, len(request.data_list), elapsed, success)

    record_id = _save_result(request, report, success, error_msg)

    return report, success, error_msg, record_id


def analyze_stream(request: AnalysisRequest):
    """流式 Map-Reduce 分析：逐用户分析 → 合成报告（SSE 推送进度）"""
    t0 = time.time()

    def _sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    try:
        client = _get_client()
        model = os.getenv("DASHSCOPE_MODEL", "qwen-plus")

        total_data = len(request.data_list)
        yield _sse("progress", {"message": f"正在分组分析 {total_data} 条对话..."})

        # Phase 1: 按用户分组并发分析
        groups = _group_by_user(request.data_list)
        all_uids = list(groups.keys())
        total_users = len(all_uids)
        summaries = {}
        done_count = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=_BATCH_CONCURRENCY) as executor:
            for batch_start in range(0, total_users, _BATCH_CONCURRENCY):
                batch = all_uids[batch_start:batch_start + _BATCH_CONCURRENCY]
                futures = {
                    executor.submit(
                        _analyze_single_user, client, model,
                        uid, groups[uid]["name"], groups[uid]["items"],
                    ): uid
                    for uid in batch
                }
                for future in concurrent.futures.as_completed(futures):
                    uid = futures[future]
                    done_count += 1
                    try:
                        summaries[uid] = future.result()
                    except Exception as e:
                        logger.error("用户 %s 分析失败: %s", uid, e)
                        summaries[uid] = {
                            "topics": [], "usage_pattern": "", "repeat_analysis": "",
                            "effectiveness": "~50%", "maturity": "⭐⭐", "tags": [],
                            "focus_areas": "", "summary": f"分析失败: {type(e).__name__}",
                        }
                    yield _sse("progress", {
                        "message": f"用户分析进度 {done_count}/{total_users}...",
                        "done": done_count, "total": total_users,
                    })
                # 批次间隔，避免触发限流
                if batch_start + _BATCH_CONCURRENCY < total_users:
                    time.sleep(_BATCH_DELAY)

        # 构建 user_stats
        user_stats = []
        for uid in all_uids:
            g = groups[uid]
            user_stats.append({
                "user_id": uid,
                "user_name": g["name"] or uid,
                "count": len(g["items"]),
                **summaries.get(uid, {}),
            })
        user_stats.sort(key=lambda x: x["count"], reverse=True)

        yield _sse("progress", {"message": f"用户分析完成（{total_users} 位），正在生成综合报告..."})

        # Phase 2: 合成最终报告（流式推送）
        synthesis_prompt = _build_synthesis_prompt(request, user_stats)
        raw_parts = []

        stream = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": synthesis_prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
            timeout=500.0,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                raw_parts.append(delta.content)
                yield _sse("chunk", {"text": delta.content})

        raw_output = "".join(raw_parts)
        report = _parse_llm_output(raw_output)

        if request.coverage_display:
            report.header.covered_days = request.coverage_display

        success = True
        error_msg = None
        if report.header.total_conversations == 0 and not report.usage_ranking:
            success = False
            error_msg = "LLM 返回空报告，可能是数据不足或模型未能理解输入"

    except (AuthenticationError, RateLimitError, APITimeoutError, APIStatusError, psycopg2.OperationalError) as e:
        logger.error("LLM 分析异常 [%s]: %s", type(e).__name__, e)
        report = _empty_report()
        success = False
        error_msg = _classify_error(e)

    except Exception as e:
        logger.error("LLM 分析过程异常: %s", e, exc_info=True)
        report = _empty_report()
        success = False
        error_msg = _classify_error(e)

    elapsed = time.time() - t0
    logger.info("流式分析完成 app_id=%s data_count=%d 耗时=%.1fs success=%s",
                request.app_id, len(request.data_list), elapsed, success)

    record_id = _save_result(request, report, success, error_msg)

    if success:
        yield _sse("done", {"success": True, "analysis_id": record_id, "elapsed": round(elapsed, 1)})
    else:
        yield _sse("error", {"error": error_msg or "未知错误", "analysis_id": record_id, "elapsed": round(elapsed, 1)})
