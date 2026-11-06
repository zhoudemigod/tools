# AI 可见水印处理工具

这是一个本地运行的 Python Web 工具，使用
[`wiltodelta/remove-ai-watermarks`](https://github.com/wiltodelta/remove-ai-watermarks)
识别并修复已注册的可见 AI 标记。项目使用 uv 管理依赖，后端为 FastAPI，
前端使用原生 HTML、CSS 和 JavaScript。

## 功能范围

- 支持 JPG、PNG、WebP，单张图片最大 20 MB。
- 自动识别并局部修复上游项目已注册的可见 AI 标记。
- 使用 OpenCV 修复后端，不需要 CUDA 或独立显卡。
- 在页面中预览处理前后图片并下载结果。
- 图片仅写入系统临时目录，请求结束后自动清理。
- 默认保留 AI 来源元数据，不处理隐形水印或 C2PA 来源凭证。

## 使用限制

仅处理你拥有或已获得明确编辑授权的图片。使用前还应确认：

- 图片使用场景是否依法需要保留 AI 内容标识；
- 平台或生成服务的条款是否允许修改标记；
- 修改结果是否可能误导他人判断作品来源。

不同司法辖区对 AI 标识删除和相关工具有不同限制。此项目不用于欺诈、
冒充、隐藏侵权、规避法定披露或处理他人的付费素材。

## 环境要求

- Python 3.12
- uv 0.10 或更高版本

## 安装

在项目目录执行：

```powershell
uv sync
```

uv 会根据 `pyproject.toml` 和 `uv.lock` 创建独立虚拟环境并安装依赖。
项目在 Windows 上固定使用 `c2pa-python 0.38.0`，因为后续的 0.38.2
没有发布 Windows x64 轮子；该版本仍满足上游库声明的最低版本要求。

## 启动

```powershell
uv run watermark-cleaner
```

浏览器访问 `http://127.0.0.1:8000`。

开发时也可以启用自动重载：

```powershell
uv run uvicorn watermark_web.app:app --reload --host 127.0.0.1 --port 8000
```

## 测试

```powershell
uv run pytest
```

测试通过模拟上游图像处理函数验证上传、授权、真实格式校验和下载响应，
不会下载模型，也不会依赖 GPU。

## 项目结构

```text
remove-ai-watermarks/
├── pyproject.toml
├── uv.lock
├── src/watermark_web/
│   ├── __init__.py
│   └── app.py
├── web/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── tests/
    └── test_app.py
```

## 上游能力边界

可见标记处理流程是：识别已注册标记、生成局部遮罩、使用 OpenCV 修复区域，
再由同一检测器复核。复杂纹理可能出现残留或修复痕迹；“未发现标记”也不代表
图片不存在未注册的可见标记、隐形水印或其他来源信号。
