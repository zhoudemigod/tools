"""验证本地 Web 接口的输入约束和处理结果响应。"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from shutil import copyfile
from types import SimpleNamespace

from fastapi.testclient import TestClient
from PIL import Image

from watermark_web.app import app

# 测试客户端，在进程内调用 FastAPI 应用而不启动网络端口。
client = TestClient(app)


def build_png() -> bytes:
    """创建一张用于接口测试的最小有效 PNG 图片。

    Returns:
        32×24 像素 PNG 图片的完整字节内容。
    """
    # 1. 构建图片：使用固定颜色保证测试结果可重复。
    image = Image.new("RGB", (32, 24), color=(231, 89, 54))
    # 2. 编码结果：写入内存并返回 PNG 字节。
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def fake_remove_visible(source: Path, target: Path, **_: object) -> SimpleNamespace:
    """模拟上游处理并复制输入图片到输出路径。

    Args:
        source: 测试请求生成的临时输入图片路径。
        target: 应用期望生成的临时输出图片路径。
        **_: 上游函数的其他命名参数，本测试不使用。

    Returns:
        包含 cleaned 状态和 Gemini 标记的模拟报告。
    """
    # 1. 生成结果：复制有效图片以模拟算法成功写出。
    copyfile(source, target)
    # 2. 返回报告：字段形状与页面实际读取的上游结果一致。
    mark = SimpleNamespace(label="gemini")
    return SimpleNamespace(status="cleaned", marks=[mark])


def test_health_endpoint() -> None:
    """用例：健康检查应返回固定 ok 状态。"""
    # 接口响应，包含 HTTP 状态和 JSON 内容。
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_remove_requires_authorization() -> None:
    """用例：未确认拥有或获授权时应拒绝处理图片。"""
    # 未携带授权字段的处理请求。
    response = client.post(
        "/api/remove",
        files={"image": ("sample.png", build_png(), "image/png")},
    )
    assert response.status_code == 400
    assert "授权" in response.json()["detail"]


def test_remove_rejects_invalid_image() -> None:
    """用例：伪装成 PNG 的文本文件应被真实内容校验拒绝。"""
    # MIME 看似正确但内容无效的上传请求。
    response = client.post(
        "/api/remove",
        data={"authorized": "true"},
        files={"image": ("fake.png", b"not-an-image", "image/png")},
    )
    assert response.status_code == 422
    assert "有效的图片" in response.json()["detail"]


def test_remove_returns_processed_image(monkeypatch) -> None:
    """用例：有效且获授权的图片应返回处理结果和质量响应头。"""
    # 1. 替换算法：隔离模型行为，只验证 Web 层数据流和响应契约。
    monkeypatch.setattr("watermark_web.app.raiw.remove_visible_detailed", fake_remove_visible)
    # 2. 发起请求：提交有效 PNG 和明确授权确认。
    response = client.post(
        "/api/remove",
        data={"authorized": "true"},
        files={"image": ("sample.png", build_png(), "image/png")},
    )
    # 3. 核对结果：图片格式、质量状态与标记名称应完整返回。
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-removal-status"] == "cleaned"
    assert response.headers["x-removed-marks"] == "gemini"
    assert response.content.startswith(b"\x89PNG")
