<div align="center">

# 开源好物集 · Tools

一组开箱即用的单文件图片处理工具。无需安装依赖，使用浏览器打开即可运行。

[![License](https://img.shields.io/badge/License-Apache%202.0-3E75C3.svg)](./LICENSE)
![HTML](https://img.shields.io/badge/HTML-单文件工具-E34F26?logo=html5&logoColor=white)
![Privacy](https://img.shields.io/badge/Privacy-本地处理-34765A)

[官方网站](https://www.huima123.com) · [GitHub](https://github.com/zhoudemigod/tools) · [Gitee](https://gitee.com/HD85512b/tools)

</div>

## 项目简介

本项目收集简单、实用、可离线运行的网页小工具。每个功能使用独立文件夹管理，核心页面均为一个 `index.html`，不依赖后端服务，也不需要构建环境。

- **开箱即用**：下载后直接使用浏览器打开。
- **隐私友好**：图片在本地浏览器中处理，不会上传到服务器。
- **零依赖**：原生 HTML、CSS 和 JavaScript 实现。
- **响应式布局**：兼容桌面端与移动端浏览器。
- **无障碍操作**：主要功能支持键盘操作和清晰的焦点状态。

## 在线入口

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 官方网站 | [https://www.huima123.com](https://www.huima123.com) | 了解更多产品与服务 |
| GitHub 仓库 | [zhoudemigod/tools](https://github.com/zhoudemigod/tools) | 查看源码、提交 Issue 或参与贡献 |
| Gitee 仓库 | [HD85512b/tools](https://gitee.com/HD85512b/tools) | 国内镜像与源码访问 |
| 微信小程序 | **二维码体验地址待补充** | 当前使用占位说明，二维码发布后更新 |

> 微信小程序二维码体验入口暂未发布。后续将补充可扫码访问的二维码图片与体验地址。

## 功能目录

项目计划逐步扩展至 50 款实用工具，每个工具使用独立的英文目录维护。

| 名称 | 项目目录 | 功能介绍 |
| --- | --- | --- |
| 图片放大镜 | [`image-magnifier`](./image-magnifier/) | 打开或拖入本地图片，通过可调倍率和镜面大小查看局部细节，支持鼠标、触屏和键盘操作。 |
| 图片裁剪、拼接与网格切图 | [`crop-image`](./crop-image/) | 集成常用比例裁剪、多图横纵拼接和自动网格切图，处理结果可导出为常见图片格式。 |

## 快速开始

### 直接使用

1. 下载或克隆本仓库。
2. 进入需要使用的功能目录。
3. 使用现代浏览器打开目录中的 `index.html`。

```bash
git clone https://github.com/zhoudemigod/tools.git
cd tools
```

也可以通过 Gitee 获取源码：

```bash
git clone https://gitee.com/HD85512b/tools.git
cd tools
```

### 启动本地静态服务

直接打开 HTML 即可使用。若浏览器对本地文件有限制，也可以在项目根目录启动静态服务：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080/image-magnifier/
http://localhost:8080/crop-image/
```

## 浏览器兼容性

建议使用最新版本的 Chrome、Edge、Firefox 或 Safari。工具依赖浏览器的 Canvas、File API 和 Object URL 等原生能力；部分旧版浏览器可能不支持 WebP 导出。

## TODO

- [ ] **海报设计** — 待实现
- [ ] **去水印** — 待实现
- [ ] **抠图** — 待实现

欢迎通过 [GitHub Issues](https://github.com/zhoudemigod/tools/issues) 提交新功能建议或使用反馈。

## 参与贡献

欢迎提交 Issue 和 Pull Request。新增工具时建议遵循以下约定：

1. 每个工具使用独立的英文文件夹，文件夹名称采用 `kebab-case`。
2. 默认入口统一为 `index.html`，并尽量保持单文件、零依赖。
3. 图片处理优先在浏览器本地完成，不上传用户文件。
4. 同步更新 README 中的功能目录、项目结构和使用说明。
5. 提交前检查桌面端、移动端和键盘操作体验。

## 开源许可

本项目基于 [Apache License 2.0](./LICENSE) 开源。使用、修改或分发代码时，请遵守许可证中的相关约定。

---

<div align="center">

如果这些工具对你有帮助，欢迎 Star、分享或参与共建。

</div>
