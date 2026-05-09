"""
models.py - Pydantic 数据模型定义

定义请求入参、LLM 输出（六段式分析报告）和 API 响应的严格数据结构。
"""

from typing import Optional

from pydantic import BaseModel, Field


# ============================================================
# 请求入参模型（主后端 -> 本服务）
# ============================================================

class Dialogue(BaseModel):
    """单条对话中的 user/ai 对"""
    user: str = Field(..., description="用户输入内容")
    ai: str = Field(..., description="AI 回复内容")


class DialogueItem(BaseModel):
    """对话日志中的一条记录"""
    time: str = Field(..., description="对话时间，如 2026-04-20 10:05")
    user_id: str = Field(..., description="用户唯一标识")
    user_name: str = Field(default="", description="用户真实姓名（可选，用于报告展示）")
    status: str = Field(..., description="处理状态，如 '处理成功'")
    latency_ms: int = Field(..., ge=0, description="响应延迟（毫秒），必须 >= 0")
    dialogue: Dialogue = Field(..., description="对话内容")


class AnalysisRequest(BaseModel):
    """上游主后端发来的分析请求"""
    app_id: str = Field(..., min_length=1, description="工作流/应用 ID")
    company_id: int = Field(..., ge=0, description="公司 ID，多租户数据隔离（0=平台超管）")
    app_name: str = Field(default="", description="应用名称（用于报告标题）")
    analysis_target: str = Field(..., min_length=1, description="分析目标描述")
    data_list: list[DialogueItem] = Field(..., min_length=1, description="待分析的对话列表")
    date_range: str = Field(default="", description="数据时间范围描述，如 '2026-04-13 至 2026-04-14'")
    time_range: str = Field(default="week", description="时间范围类型：week（过去一周）或 day（过去一天）")
    coverage_display: str = Field(default="", description="覆盖日期显示文本，如 '2026年4月21日' 或 '2026年4月13日 - 2026年4月19日'")


# ============================================================
# 报告各段数据模型
# ============================================================

class UsageRankingItem(BaseModel):
    """01 - 使用排名条目"""
    user_name: str = Field(..., description="用户姓名")
    user_id: str = Field(default="", description="用户 ID")
    count: int = Field(..., description="提问数量")
    note: str = Field(default="", description="补充说明（如多轮对话解释）")


class CategoryItem(BaseModel):
    """02 - 问题分类条目"""
    icon: str = Field(default="📋", description="分类图标 emoji")
    name: str = Field(..., description="分类名称")
    count: str = Field(..., description="数量描述，如 '~5条'")
    description: str = Field(..., description="分类详细说明（换行用 \\n）")
    who: str = Field(..., description="涉及的人员")


class CommonPatternItem(BaseModel):
    """03 - 共性问题条目"""
    badge: str = Field(..., description="标签文字，如 '2人共同关注' 或 '隐性风险'")
    badge_type: str = Field(default="info", description="标签类型：info 或 warn")
    title: str = Field(..., description="共性问题标题")
    detail: str = Field(..., description="详细分析说明")
    who: str = Field(..., description="涉及的人员及各自角度")


class SpotlightBlock(BaseModel):
    """04 - 核心用户深度解析"""
    title: str = Field(..., description="标题，如 '秦雪：本组最活跃用户'")
    text: str = Field(..., description="深度分析文字")


class TagItem(BaseModel):
    """标签"""
    label: str = Field(..., description="标签文字")
    color: str = Field(default="blue", description="颜色类型：blue/orange/red/purple/green")


class RepeatAnalysis(BaseModel):
    """重复性分析"""
    text: str = Field(..., description="重复/递进问题分析文字")


class PersonBreakdownItem(BaseModel):
    """04 - 每人问题分类条目"""
    user_name: str = Field(..., description="用户姓名")
    user_id: str = Field(default="", description="用户 ID")
    count: int = Field(..., description="提问数量")
    tags: list[TagItem] = Field(default_factory=list, description="问题分类标签")
    description: str = Field(..., description="使用模式分析")
    repeat_analysis: RepeatAnalysis = Field(..., description="重复性分析")


class InsightItem(BaseModel):
    """05 - 重要发现条目"""
    icon: str = Field(default="💡", description="图标 emoji")
    title: str = Field(..., description="发现标题")
    text: str = Field(..., description="详细说明")


class SummaryTableRow(BaseModel):
    """06 - 汇总表行"""
    user_name: str = Field(..., description="姓名")
    user_id: str = Field(default="", description="用户 ID")
    count: int = Field(..., description="提问量")
    effectiveness: str = Field(default="~90%", description="有效率")
    focus_areas: str = Field(..., description="主要关注领域")
    repetition: str = Field(..., description="问题重复性评价")
    maturity: str = Field(default="", description="使用成熟度评分")


class HeaderMeta(BaseModel):
    """报告头部统计数据"""
    total_conversations: int = Field(..., description="有效对话数")
    active_members: int = Field(..., description="活跃成员数")
    covered_days: str = Field(default="", description="覆盖天数描述")
    core_scenario: str = Field(default="", description="核心场景")


# ============================================================
# 完整分析报告（LLM 输出）
# ============================================================

class AnalysisReport(BaseModel):
    """大模型生成的完整六段式分析报告"""
    header: HeaderMeta = Field(..., description="报告头部统计数据")
    usage_ranking: list[UsageRankingItem] = Field(default_factory=list, description="01-每人提问数量排名")
    categories: list[CategoryItem] = Field(default_factory=list, description="02-整个团队问题种类分类")
    common_patterns: list[CommonPatternItem] = Field(default_factory=list, description="03-团队共性问题")
    spotlight: Optional[SpotlightBlock] = Field(default=None, description="04-核心用户深度解析")
    person_breakdown: list[PersonBreakdownItem] = Field(default_factory=list, description="04-每人问题分类与重复性分析")
    key_insights: list[InsightItem] = Field(default_factory=list, description="05-其他重要分析维度")
    summary_table: list[SummaryTableRow] = Field(default_factory=list, description="06-团队使用情况综合汇总")


# ============================================================
# API 响应模型（本服务 -> 主后端）
# ============================================================

class AnalyzeResponse(BaseModel):
    """统一响应包装"""
    success: bool = Field(..., description="分析是否成功")
    data: AnalysisReport = Field(..., description="分析报告")
    error: Optional[str] = Field(default=None, description="错误信息")
    analysis_id: Optional[int] = Field(default=None, description="持久化记录 ID")


# ============================================================
# 历史查询模型
# ============================================================

class AnalysisHistoryItem(BaseModel):
    """分析历史记录条目"""
    id: int
    app_id: str
    analysis_target: str
    data_count: int
    summary: str
    success: bool
    created_at: str
