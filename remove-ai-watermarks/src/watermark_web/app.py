"""提供图片上传、可见 AI 水印处理与结果下载接口。"""

from __future__ import annotations

import tempfile
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import remove_ai_watermarks as raiw
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from PIL import Image, UnidentifiedImageError

# 应用包所在目录，用于稳定定位项目内的静态页面。
PACKAGE_ROOT = Path(__file__).resolve().parent
# 项目根目录，兼容源码运行与 uv 安装后的可编辑环境。
PROJECT_ROOT = PACKAGE_ROOT.parents[1]
# 原生 HTML、CSS 与 JavaScript 文件目录；优先读取 wheel 内资源，源码模式回退到项目目录。
WEB_ROOT = PACKAGE_ROOT / "web" if (PACKAGE_ROOT / "web").exists() else PROJECT_ROOT / "web"
# 单次上传上限为 20 MiB，避免本地服务被超大文件占满内存。
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# 允许处理的真实图片格式及其安全文件扩展名。
SUPPORTED_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}
# 图片像素上限，兼顾常见高清图片与解压缩炸弹防护。
Image.MAX_IMAGE_PIXELS = 60_000_000

# Web 应用实例，只提供本地单页和处理接口。
app = FastAPI(
    title="AI Watermark Cleaner",
    description="Remove registered visible AI marks from authorized images.",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


def validate_image(payload: bytes) -> tuple[str, str]:
    """校验上传内容并返回可信图片格式和对应扩展名。

    Args:
        payload: 完整上传内容，不得为空且不得超过 20 MiB。

    Returns:
        由 Pillow 识别的格式名与安全扩展名。

    Raises:
        HTTPException: 文件为空、过大、损坏或格式不受支持时抛出。
    """
    # 1. 校验容量：在进入图片解码和算法处理前拒绝异常输入。
    if not payload:
        raise HTTPException(status_code=400, detail="请选择需要处理的图片。")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="图片不能超过 20 MB。")

    # 2. 校验格式：以真实文件内容为准，不信任浏览器提交的扩展名和 MIME。
    try:
        with Image.open(BytesIO(payload)) as source_image:
            # Pillow 识别出的原始格式名，可能为空。
            image_format = source_image.format or ""
            source_image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=422, detail="文件不是有效的图片，或图片已损坏。") from error

    # 3. 限定输出：第一版只处理浏览器兼容且上游稳定支持的三种格式。
    if image_format not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=422, detail="当前仅支持 JPG、PNG 和 WebP 图片。")
    return image_format, SUPPORTED_FORMATS[image_format]


def remove_visible_marks(payload: bytes, suffix: str) -> tuple[bytes, str, list[str]]:
    """调用上游算法移除已注册的可见 AI 标记并保留来源元数据。

    Args:
        payload: 已完成格式校验的原始图片内容。
        suffix: 由真实图片格式映射得到的安全扩展名。

    Returns:
        处理后图片内容、质量状态和识别到的标记名称列表。

    Raises:
        RuntimeError: 上游没有生成预期输出时抛出。
    """
    # 1. 隔离文件：每次请求使用独立临时目录，结束后自动清理输入和输出。
    with tempfile.TemporaryDirectory(prefix="watermark-cleaner-") as temporary_directory:
        # 本次请求的临时目录路径。
        work_directory = Path(temporary_directory)
        # 经校验后写入的算法输入路径。
        input_path = work_directory / f"source{suffix}"
        # 与输入格式一致的算法输出路径。
        output_path = work_directory / f"cleaned{suffix}"
        input_path.write_bytes(payload)

        # 2. 执行处理：cv2 后端无需 GPU；关闭元数据剥离以保留 AI 来源声明。
        report = raiw.remove_visible_detailed(
            input_path,
            output_path,
            backend="cv2",
            sensitivity="auto",
            strip_metadata=False,
            write_noop=True,
        )
        if not output_path.exists():
            raise RuntimeError("处理完成但没有生成输出图片。")

        # 3. 整理结果：仅返回前端展示所需的稳定状态和标记名称。
        output_payload = output_path.read_bytes()
        # 上游质量状态，例如 cleaned、partial、unvalidated 或 no_watermark。
        status = str(getattr(report, "status", "unvalidated"))
        # 上游命中的可见标记名称；无命中时为空列表。
        labels = [
            str(getattr(mark, "label", "unknown"))
            for mark in getattr(report, "marks", [])
        ]
        return output_payload, status, labels


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    """返回水印处理工具的单页界面。

    Returns:
        项目内的 HTML 首页文件响应。
    """
    return FileResponse(WEB_ROOT / "index.html", media_type="text/html; charset=utf-8")


@app.get("/assets/styles.css", include_in_schema=False)
async def styles() -> FileResponse:
    """返回单页界面的样式表。

    Returns:
        项目内的 CSS 文件响应。
    """
    return FileResponse(WEB_ROOT / "styles.css", media_type="text/css; charset=utf-8")


@app.get("/assets/app.js", include_in_schema=False)
async def script() -> FileResponse:
    """返回单页界面的交互脚本。

    Returns:
        项目内的 JavaScript 文件响应。
    """
    return FileResponse(WEB_ROOT / "app.js", media_type="text/javascript; charset=utf-8")


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    """返回本地服务健康状态。

    Returns:
        包含固定 ok 状态的健康检查结果。
    """
    return {"status": "ok"}


@app.post("/api/remove", include_in_schema=False)
async def remove_watermark(
    image: UploadFile = File(...),
    authorized: bool = Form(False),
) -> Response:
    """处理一张用户拥有或获授权的图片并返回可下载结果。

    Args:
        image: JPG、PNG 或 WebP 图片，最大 20 MiB。
        authorized: 用户确认拥有图片或已获得编辑授权。

    Returns:
        处理后的图片二进制响应，并在响应头中携带质量状态。

    Raises:
        HTTPException: 未确认授权、输入无效或算法处理失败时抛出。
    """
    # 1. 权利确认：服务端再次校验，不能只依赖前端复选框。
    if not authorized:
        raise HTTPException(status_code=400, detail="请先确认你拥有图片或已获得编辑授权。")

    # 2. 输入校验：读取受限大小的内容并根据真实字节识别图片格式。
    try:
        # 多读取一个字节，用于准确判断是否超过容量上限。
        payload = await image.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await image.close()
    # 真实图片格式名，仅用于生成稳定的下载 MIME。
    image_format, suffix = validate_image(payload)

    # 3. 算法处理：阻塞型图像计算移至线程池，避免卡住异步事件循环。
    try:
        output_payload, status, labels = await run_in_threadpool(
            remove_visible_marks,
            payload,
            suffix,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail="图片处理失败，请更换图片后重试。") from error

    # 4. 组织下载：文件名和自定义响应头均进行安全编码。
    # 用户文件名去除路径，仅保留用于下载提示的名称主体。
    source_stem = Path(image.filename or "image").stem[:80] or "image"
    # RFC 5987 编码后的下载文件名，可安全承载中文和空格。
    download_name = quote(f"{source_stem}_clean{suffix}", safe="")
    # 标记名称以 URL 编码形式传给同源前端，避免非 ASCII 响应头错误。
    encoded_labels = quote(",".join(labels), safe="")
    # 输出格式对应的浏览器标准 MIME。
    media_type = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }[image_format]
    return Response(
        content=output_payload,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{download_name}",
            "Cache-Control": "no-store",
            "X-Removal-Status": status,
            "X-Removed-Marks": encoded_labels,
        },
    )


def run() -> None:
    """以适合本地使用的默认参数启动 Web 服务。"""
    uvicorn.run("watermark_web.app:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    run()
