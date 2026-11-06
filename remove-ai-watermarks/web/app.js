"use strict";

/** 页面交互所需的全部 DOM 元素。 */
const elements = {
  /** 当前图片文件名。 */
  fileName: document.querySelector("#fileName"),
  /** 当前图片像素尺寸。 */
  dimensions: document.querySelector("#dimensions"),
  /** 更换图片按钮。 */
  replaceButton: document.querySelector("#replaceButton"),
  /** 支持拖入文件的工作区。 */
  dropZone: document.querySelector("#dropZone"),
  /** 未上传图片时的空状态。 */
  emptyState: document.querySelector("#emptyState"),
  /** 首次选择图片按钮。 */
  uploadButton: document.querySelector("#uploadButton"),
  /** 图片编辑区域容器。 */
  editor: document.querySelector("#editor"),
  /** 原图与结果图叠加区域。 */
  compareView: document.querySelector("#compareView"),
  /** 原始图片图层。 */
  sourceImage: document.querySelector("#sourceImage"),
  /** 模型处理结果图层。 */
  resultImage: document.querySelector("#resultImage"),
  /** 提交处理按钮。 */
  processButton: document.querySelector("#processButton"),
  /** 下载结果按钮。 */
  downloadButton: document.querySelector("#downloadButton"),
  /** 处理状态提示。 */
  statusMessage: document.querySelector("#statusMessage"),
  /** 隐藏的系统文件选择输入框。 */
  imageInput: document.querySelector("#imageInput"),
};

/** 当前页面会话中的图片、结果和对比状态。 */
const state = {
  /** 当前选择的原始图片文件。 */
  file: null,
  /** 原图的浏览器对象 URL。 */
  sourceUrl: null,
  /** 处理结果的浏览器对象 URL。 */
  resultUrl: null,
  /** 处理结果的下载文件名。 */
  resultName: null,
  /** 当前是否正在执行模型处理。 */
  processing: false,
  /** 原图与结果图分隔线位置，单位为百分比。 */
  comparePosition: 50,
};

/** 浏览器允许选择的图片 MIME 集合。 */
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
/** 单张图片最大字节数，与后端限制保持一致。 */
const maxUploadBytes = 20 * 1024 * 1024;

/**
 * 更新页面状态消息及其视觉语义。
 *
 * @param {string} message 面向用户的状态说明
 * @param {"idle"|"success"|"error"} tone 消息语义类型
 * @returns {void}
 */
function setStatus(message, tone = "idle") {
  // 1. 更新文本：通过 live region 向辅助技术报告处理进度。
  elements.statusMessage.textContent = message;
  // 2. 更新颜色：成功和失败状态保持可辨识反馈。
  elements.statusMessage.classList.toggle("is-success", tone === "success");
  elements.statusMessage.classList.toggle("is-error", tone === "error");
}

/**
 * 释放浏览器对象 URL，避免更换图片后保留旧图片内存。
 *
 * @param {string|null} objectUrl 待释放的对象 URL，可为空
 * @returns {void}
 */
function revokeObjectUrl(objectUrl) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
}

/**
 * 根据当前图片和处理状态更新提交按钮。
 *
 * @returns {void}
 */
function updateProcessState() {
  elements.processButton.disabled = !state.file || state.processing;
}

/**
 * 清除当前处理结果并恢复原图预览状态。
 *
 * @returns {void}
 */
function resetResult() {
  // 1. 回收旧结果：连续处理时只保留最新结果。
  revokeObjectUrl(state.resultUrl);
  state.resultUrl = null;
  state.resultName = null;
  elements.resultImage.src = state.sourceUrl || "";
  // 2. 恢复预览：隐藏比较线和下载入口。
  elements.compareView.classList.remove("has-result");
  elements.downloadButton.hidden = true;
  elements.compareView.style.setProperty("--split", "50%");
  state.comparePosition = 50;
}

/**
 * 打开系统图片选择器。
 *
 * @returns {void}
 */
function openFilePicker() {
  elements.imageInput.click();
}

/**
 * 在原图加载完成后同步画布比例和尺寸信息。
 *
 * @returns {void}
 */
function handleSourceImageLoad() {
  /** 原图像素宽度。 */
  const width = elements.sourceImage.naturalWidth;
  /** 原图像素高度。 */
  const height = elements.sourceImage.naturalHeight;
  if (!width || !height) return;
  elements.compareView.style.aspectRatio = `${width} / ${height}`;
  elements.dimensions.textContent = `${width} × ${height}`;
}

/**
 * 校验并显示用户选择的图片。
 *
 * @param {File|null} file 用户选择或拖入的图片文件
 * @returns {void}
 */
function selectFile(file) {
  // 1. 校验文件：前端快速反馈，服务端仍会按真实字节复核。
  if (!file) return;
  if (!supportedTypes.has(file.type)) {
    setStatus("仅支持 JPG、PNG 和 WebP。", "error");
    return;
  }
  if (file.size > maxUploadBytes) {
    setStatus("图片不能超过 20 MB。", "error");
    return;
  }

  // 2. 更新图片资源：释放旧原图和处理结果，再创建本地预览。
  revokeObjectUrl(state.sourceUrl);
  state.file = file;
  state.sourceUrl = URL.createObjectURL(file);
  resetResult();
  elements.sourceImage.src = state.sourceUrl;
  elements.resultImage.src = state.sourceUrl;

  // 3. 更新工作区：直接进入可处理状态，不要求模式选择或区域框选。
  elements.fileName.textContent = file.name;
  elements.emptyState.hidden = true;
  elements.editor.hidden = false;
  elements.replaceButton.hidden = false;
  setStatus("图片已就绪。", "idle");
  updateProcessState();
}

/**
 * 根据指针横坐标更新原图与处理图分隔线。
 *
 * @param {PointerEvent} event 图片比较区域指针事件
 * @returns {void}
 */
function updateComparisonFromPointer(event) {
  if (!state.resultUrl) return;
  /** 图片比较区域的屏幕矩形。 */
  const bounds = elements.compareView.getBoundingClientRect();
  /** 指针在图片宽度中的百分比位置。 */
  const position = ((event.clientX - bounds.left) / bounds.width) * 100;
  state.comparePosition = Math.min(Math.max(position, 0), 100);
  elements.compareView.style.setProperty("--split", `${state.comparePosition}%`);
}

/**
 * 在触屏设备上开始控制结果对比分隔线。
 *
 * @param {PointerEvent} event 图片区域指针按下事件
 * @returns {void}
 */
function handlePointerDown(event) {
  if (!state.resultUrl) return;
  elements.compareView.setPointerCapture(event.pointerId);
  updateComparisonFromPointer(event);
}

/**
 * 移动指针时同步结果对比分隔线。
 *
 * @param {PointerEvent} event 图片区域指针移动事件
 * @returns {void}
 */
function handlePointerMove(event) {
  updateComparisonFromPointer(event);
}

/**
 * 释放触屏对比分隔线的指针捕获。
 *
 * @param {PointerEvent} event 图片区域指针释放事件
 * @returns {void}
 */
function handlePointerUp(event) {
  if (elements.compareView.hasPointerCapture(event.pointerId)) {
    elements.compareView.releasePointerCapture(event.pointerId);
  }
}

/**
 * 使用方向键微调处理结果的对比分隔线。
 *
 * @param {KeyboardEvent} event 图片比较区域键盘事件
 * @returns {void}
 */
function handleCompareKeydown(event) {
  if (!state.resultUrl || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
  /** 方向键对应的对比线移动量，单位为百分比。 */
  const delta = event.key === "ArrowLeft" ? -2 : 2;
  state.comparePosition = Math.min(Math.max(state.comparePosition + delta, 0), 100);
  elements.compareView.style.setProperty("--split", `${state.comparePosition}%`);
  event.preventDefault();
}

/**
 * 从响应头读取下载文件名。
 *
 * @param {Response} response 图片处理接口响应
 * @returns {string} 结果图片下载文件名
 */
function getDownloadName(response) {
  /** Content-Disposition 响应头，可能为空。 */
  const disposition = response.headers.get("Content-Disposition") || "";
  /** RFC 5987 文件名匹配结果。 */
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (!match) return "cleaned-image.png";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "cleaned-image.png";
  }
}

/**
 * 从失败响应中读取用户可理解的错误提示。
 *
 * @param {Response} response 处理失败的接口响应
 * @returns {Promise<string>} 标准化错误信息
 */
async function getErrorMessage(response) {
  try {
    /** 后端返回的错误响应对象。 */
    const body = await response.json();
    /** FastAPI detail 字段，可能是字符串或结构化对象。 */
    const detail = body.detail;
    if (detail && typeof detail === "object") {
      return detail.message || "处理失败，请重试。";
    }
    return detail || "处理失败，请重试。";
  } catch {
    return "处理失败，请重试。";
  }
}

/**
 * 把响应头中的模型后端转换为简短状态文本。
 *
 * @param {Response} response 图片处理接口响应
 * @returns {string} 面向用户的模型名称
 */
function getBackendLabel(response) {
  /** 上游实际使用的模型后端名称列表。 */
  const backend = decodeURIComponent(response.headers.get("X-Removal-Backend") || "");
  if (backend.includes("lama")) return "LaMa 模型";
  if (backend.includes("migan")) return "MI-GAN 模型";
  return "自动修复";
}

/**
 * 自动检测当前图片的已注册水印并显示模型处理结果。
 *
 * @returns {Promise<void>}
 */
async function processImage() {
  if (elements.processButton.disabled || !state.file) return;

  // 1. 锁定操作：避免同一图片在模型推理期间重复提交。
  state.processing = true;
  elements.processButton.classList.add("is-loading");
  resetResult();
  updateProcessState();
  setStatus("正在识别并修复…", "idle");

  try {
    // 2. 构建请求：只提交原图，标记检测和位置计算均由上游完成。
    /** 图片处理接口表单数据。 */
    const formData = new FormData();
    formData.append("image", state.file);
    /** 本地图片处理接口响应。 */
    const response = await fetch("/api/remove", { method: "POST", body: formData });
    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    // 3. 展示结果：结果作为底图，原图通过裁切叠加在左侧。
    /** 后端返回的处理后图片内容。 */
    const resultBlob = await response.blob();
    revokeObjectUrl(state.resultUrl);
    state.resultUrl = URL.createObjectURL(resultBlob);
    state.resultName = getDownloadName(response);
    elements.resultImage.src = state.resultUrl;
    elements.compareView.classList.add("has-result");
    elements.downloadButton.hidden = false;
    elements.compareView.style.setProperty("--split", "50%");
    state.comparePosition = 50;
    setStatus(`${getBackendLabel(response)}处理完成。`, "success");
  } catch (error) {
    /** 面向用户的稳定错误文本，不暴露内部调用栈。 */
    const message = error instanceof Error ? error.message : "处理失败，请重试。";
    setStatus(message, "error");
  } finally {
    // 4. 恢复操作：无论成功失败均允许继续处理。
    state.processing = false;
    elements.processButton.classList.remove("is-loading");
    updateProcessState();
  }
}

/**
 * 下载当前处理结果。
 *
 * @returns {void}
 */
function downloadResult() {
  if (!state.resultUrl || !state.resultName) return;
  /** 用于触发浏览器下载的临时链接。 */
  const link = document.createElement("a");
  link.href = state.resultUrl;
  link.download = state.resultName;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * 处理文件选择器返回的第一张图片。
 *
 * @returns {void}
 */
function handleFileInputChange() {
  selectFile(elements.imageInput.files?.[0] || null);
}

/**
 * 允许图片拖入工作区并显示激活反馈。
 *
 * @param {DragEvent} event 图片拖入事件
 * @returns {void}
 */
function handleDragOver(event) {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
}

/**
 * 移除工作区的拖入激活反馈。
 *
 * @returns {void}
 */
function handleDragLeave() {
  elements.dropZone.classList.remove("is-dragging");
}

/**
 * 接收拖入工作区的第一张图片。
 *
 * @param {DragEvent} event 图片放入事件
 * @returns {void}
 */
function handleDrop(event) {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  selectFile(event.dataTransfer?.files?.[0] || null);
}

/**
 * 页面退出前释放当前会话创建的对象 URL。
 *
 * @returns {void}
 */
function handleBeforeUnload() {
  revokeObjectUrl(state.sourceUrl);
  revokeObjectUrl(state.resultUrl);
}

// 1. 图片加载与拖放：上传和更换共用同一个文件选择器。
elements.uploadButton.addEventListener("click", openFilePicker);
elements.replaceButton.addEventListener("click", openFilePicker);
elements.imageInput.addEventListener("change", handleFileInputChange);
elements.sourceImage.addEventListener("load", handleSourceImageLoad);
elements.dropZone.addEventListener("dragover", handleDragOver);
elements.dropZone.addEventListener("dragleave", handleDragLeave);
elements.dropZone.addEventListener("drop", handleDrop);

// 2. 图片对比：处理完成后移动鼠标或触屏拖动分隔线。
elements.compareView.addEventListener("pointerdown", handlePointerDown);
elements.compareView.addEventListener("pointermove", handlePointerMove);
elements.compareView.addEventListener("pointerup", handlePointerUp);
elements.compareView.addEventListener("pointercancel", handlePointerUp);
elements.compareView.addEventListener("keydown", handleCompareKeydown);

// 3. 处理控制：提交、下载和资源回收均关联当前页面状态。
elements.processButton.addEventListener("click", processImage);
elements.downloadButton.addEventListener("click", downloadResult);
window.addEventListener("beforeunload", handleBeforeUnload);
