"""
main.py - FastAPI 服务入口

路由定义、CORS 中间件、应用生命周期管理。
"""

import logging
import os
import time

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import (
    AnalysisRequest,
    AnalysisReport,
    AnalyzeResponse,
    AnalysisHistoryItem,
)
from engine import analyze, analyze_stream, get_analysis_history

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ============================================================
# FastAPI 实例
# ============================================================

app = FastAPI(
    title="LLM 数据分析中台",
    description="接收对话日志，调用大模型生成六段式使用分析报告",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_check():
    """启动时检查环境变量"""
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key or api_key == "sk-your-api-key-here":
        logger.warning("DASHSCOPE_API_KEY 未配置或为默认值，LLM 调用将失败。")

    pg_host = os.getenv("PG_HOST", "")
    if not pg_host:
        logger.warning("PG_HOST 未配置，分析结果将无法持久化。")


# ============================================================
# 路由
# ============================================================

@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(request: AnalysisRequest) -> AnalyzeResponse:
    """
    核心端点：生成六段式分析报告。
    1. Pydantic 校验入参
    2. 组装 Prompt 调用大模型
    3. 解析 JSON 输出（三级降级兜底）
    4. 持久化到数据库
    5. 返回完整报告 JSON
    """
    logger.info("收到分析请求: app_id=%s company_id=%s data_count=%d time_range=%s analysis_target=%s",
                request.app_id, request.company_id, len(request.data_list),
                request.time_range, request.analysis_target[:80])
    t0 = time.time()
    try:
        report, success, error_msg, record_id = analyze(request)
        elapsed = time.time() - t0
        logger.info("分析完成: success=%s record_id=%s elapsed=%.1fs error=%s",
                    success, record_id, elapsed, error_msg)
        return AnalyzeResponse(
            success=success,
            data=report,
            error=error_msg,
            analysis_id=record_id,
        )
    except Exception as e:
        elapsed = time.time() - t0
        logger.error("分析接口异常: %s elapsed=%.1fs", e, elapsed, exc_info=True)
        raise


@app.get("/api/v1/analysis/history", response_model=list[AnalysisHistoryItem])
async def analysis_history(
    app_id: str = Query(..., description="应用 ID"),
    company_id: int = Query(..., description="公司 ID"),
    limit: int = Query(default=20, ge=1, le=100, description="返回条数"),
):
    """查询分析历史记录"""
    return get_analysis_history(app_id, company_id, limit)


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


@app.post("/api/v1/analyze/stream")
async def analyze_stream_endpoint(request: AnalysisRequest):
    """流式分析端点：逐 chunk 推送 SSE 事件"""
    return StreamingResponse(
        analyze_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
