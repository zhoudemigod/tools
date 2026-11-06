"use strict";

/** 页面交互所需的全部 DOM 元素。 */
const elements = {
  uploadForm: document.querySelector("#uploadForm"),
  dropZone: document.querySelector("#dropZone"),
  imageInput: document.querySelector("#imageInput"),
  fileSummary: document.querySelector("#fileSummary"),
  fileName: document.querySelector("#fileName"),
  fileMeta: document.querySelector("#fileMeta"),
  replaceButton: document.querySelector("#replaceButton"),
  authorizedInput: document.querySelector("#authorizedInput"),
  processButton: document.querySelector("#processButton"),
  statusMessage: document.querySelector("#statusMessage"),
  previewStage: document.querySelector("#previewStage"),
  emptyPreview: document.querySelector("#emptyPreview"),
  imagePreview: document.querySelector("#imagePreview"),
  sourcePreview: document.querySelector("#sourcePreview"),
  resultFigure: document.querySelector("#resultFigure"),
  resultPreview: document.querySelector("#resultPreview"),
  resultPill: document.querySelector("#resultPill"),
  resultActions: document.querySelector("#resultActions"),
  resultTitle: document.querySelector("#resultTitle"),
  resultDetail: document.querySelector("#resultDetail"),
  downloadButton: document.querySelector("#downloadButton"),
};

/** 当前页面会话中的文件与对象 URL 状态。 */
const state = {
  file: null,
  sourceUrl: null,
  resultUrl: null,
  resultName: null,
  processing: false,
};

/** 浏览器允许选择的图片 MIME 集合。 */
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
/** 单张图片最大字节数，与后端 20 MiB 限制保持一致。 */
const maxUploadBytes = 20 * 1024 * 1024;

/**
 * 将文件字节数格式化为便于阅读的文本。
 *
 * @param {number} bytes 文件大小，单位为字节
 * @returns {string} 带单位的文件大小文本
 */
function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 更新页面状态消息及其视觉语义。
 *
 * @param {string} message 面向用户的状态说明
 * @param {"idle"|"success"|"error"} tone 消息语义类型
 * @returns {void}
 */
function setStatus(message, tone = "idle") {
  // 1. 更新文本：让屏幕阅读器通过 live region 获知处理进度。
  elements.statusMessage.textContent = message;
  // 2. 更新语义色：错误与成功状态使用稳定的颜色反馈。
  elements.statusMessage.classList.toggle("is-error", tone === "error");
  elements.statusMessage.classList.toggle("is-success", tone === "success");
}

/**
 * 释放指定对象 URL，避免重复选择图片造成内存占用。
 *
 * @param {string|null} objectUrl 待释放的浏览器对象 URL，可为空
 * @returns {void}
 */
function revokeObjectUrl(objectUrl) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
}

/**
 * 清除上一次处理结果，并保留当前源文件选择。
 *
 * @returns {void}
 */
function resetResult() {
  // 1. 回收旧结果：确保连续处理时只保留最新结果图片。
  revokeObjectUrl(state.resultUrl);
  state.resultUrl = null;
  state.resultName = null;
  elements.resultPreview.removeAttribute("src");
  // 2. 恢复预览：隐藏结果相关说明和下载入口。
  elements.resultFigure.classList.add("is-hidden");
  elements.resultPill.classList.add("is-hidden");
  elements.resultActions.classList.add("is-hidden");
}

/**
 * 根据文件选择和授权确认状态更新提交按钮。
 *
 * @returns {void}
 */
function updateSubmitState() {
  elements.processButton.disabled = !state.file || !elements.authorizedInput.checked || state.processing;
}

/**
 * 校验并展示用户选择的本地图片。
 *
 * @param {File|null} file 用户选择或拖入的图片文件
 * @returns {void}
 */
function selectFile(file) {
  // 1. 校验选择：前端快速提示，后端仍会按真实图片字节再次验证。
  if (!file) return;
  if (!supportedTypes.has(file.type)) {
    setStatus("当前仅支持 JPG、PNG 和 WebP 图片。", "error");
    return;
  }
  if (file.size > maxUploadBytes) {
    setStatus("图片不能超过 20 MB。", "error");
    return;
  }

  // 2. 更新文件：回收旧预览并创建当前图片的本地对象 URL。
  revokeObjectUrl(state.sourceUrl);
  state.file = file;
  state.sourceUrl = URL.createObjectURL(file);
  resetResult();

  // 3. 展示预览：呈现文件信息和待处理图片。
  elements.fileName.textContent = file.name;
  elements.fileMeta.textContent = `${formatBytes(file.size)} · ${file.type.replace("image/", "").toUpperCase()}`;
  elements.fileSummary.classList.remove("is-hidden");
  elements.emptyPreview.classList.add("is-hidden");
  elements.imagePreview.classList.remove("is-hidden");
  elements.sourcePreview.src = state.sourceUrl;
  elements.previewStage.classList.remove("is-empty");
  setStatus("图片已就绪，确认授权后开始处理。", "idle");
  updateSubmitState();
}

/**
 * 从响应头读取下载文件名，并提供稳定的默认名称。
 *
 * @param {Response} response 图片处理接口响应
 * @returns {string} 结果图片的下载文件名
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
 * 从失败响应中读取适合展示的错误说明。
 *
 * @param {Response} response 处理失败的接口响应
 * @returns {Promise<string>} 后端错误说明或稳定的默认提示
 */
async function getErrorMessage(response) {
  try {
    /** 后端返回的结构化错误信息。 */
    const errorBody = await response.json();
    return errorBody.detail || "处理失败，请稍后重试。";
  } catch {
    return "处理失败，请稍后重试。";
  }
}

/**
 * 将后端状态转换为面向用户的结果说明。
 *
 * @param {string} status 上游算法返回的质量状态
 * @param {string[]} labels 已识别的可见标记名称
 * @returns {{title: string, detail: string}} 结果标题与补充说明
 */
function describeResult(status, labels) {
  /** 已识别标记的中文展示文本。 */
  const markText = labels.length ? `识别到：${labels.join("、")}` : "未识别到已注册的可见标记";
  if (status === "cleaned") return { title: "标记已移除", detail: markText };
  if (status === "partial") return { title: "已处理，建议复核", detail: `${markText}；局部仍可能有残留。` };
  if (status === "no_watermark") return { title: "未发现已注册标记", detail: "已返回原图副本，来源元数据保持不变。" };
  return { title: "处理完成，建议复核", detail: `${markText}；自动验证未能确认最终质量。` };
}

/**
 * 提交图片并在页面中展示处理结果。
 *
 * @param {SubmitEvent} event 表单提交事件
 * @returns {Promise<void>}
 */
async function handleSubmit(event) {
  event.preventDefault();
  if (!state.file || !elements.authorizedInput.checked || state.processing) return;

  // 1. 进入处理中状态：锁定重复提交并向用户显示进度。
  state.processing = true;
  elements.processButton.classList.add("is-loading");
  updateSubmitState();
  resetResult();
  setStatus("正在识别并修复可见标记，请稍候…", "idle");

  try {
    // 2. 发送请求：图片和授权确认通过同一个 multipart 表单提交。
    /** 提交给本地服务的表单内容。 */
    const formData = new FormData();
    formData.append("image", state.file);
    formData.append("authorized", "true");
    /** 本地图片处理接口响应。 */
    const response = await fetch("/api/remove", { method: "POST", body: formData });

    if (!response.ok) {
      /** 已整理为稳定文本的接口错误说明。 */
      const errorMessage = await getErrorMessage(response);
      throw new Error(errorMessage);
    }

    // 3. 读取结果：保存对象 URL、质量状态和下载名称。
    /** 后端返回的处理后图片内容。 */
    const resultBlob = await response.blob();
    /** 上游算法质量状态。 */
    const removalStatus = response.headers.get("X-Removal-Status") || "unvalidated";
    /** URL 编码的标记名称响应头。 */
    const encodedMarks = response.headers.get("X-Removed-Marks") || "";
    /** 已识别的标记名称列表。 */
    const removedMarks = encodedMarks ? decodeURIComponent(encodedMarks).split(",").filter(Boolean) : [];
    /** 面向用户的处理结果说明。 */
    const resultDescription = describeResult(removalStatus, removedMarks);

    state.resultUrl = URL.createObjectURL(resultBlob);
    state.resultName = getDownloadName(response);
    elements.resultPreview.src = state.resultUrl;
    elements.resultTitle.textContent = resultDescription.title;
    elements.resultDetail.textContent = resultDescription.detail;
    elements.resultFigure.classList.remove("is-hidden");
    elements.resultPill.classList.remove("is-hidden");
    elements.resultActions.classList.remove("is-hidden");
    setStatus("处理完成，可以预览并下载结果。", "success");
  } catch (error) {
    /** 对用户展示的稳定错误说明，不暴露内部调用栈。 */
    const message = error instanceof Error ? error.message : "处理失败，请稍后重试。";
    setStatus(message, "error");
  } finally {
    // 4. 恢复操作：无论成功失败都允许用户再次提交。
    state.processing = false;
    elements.processButton.classList.remove("is-loading");
    updateSubmitState();
  }
}

/**
 * 下载当前处理结果。
 *
 * @returns {void}
 */
function downloadResult() {
  if (!state.resultUrl || !state.resultName) return;
  /** 临时下载链接，用完后立即移除。 */
  const link = document.createElement("a");
  link.href = state.resultUrl;
  link.download = state.resultName;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * 打开系统文件选择器。
 *
 * @returns {void}
 */
function openFilePicker() {
  elements.imageInput.click();
}

/**
 * 支持通过 Enter 或空格打开文件选择器。
 *
 * @param {KeyboardEvent} event 拖放区域键盘事件
 * @returns {void}
 */
function handleDropZoneKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFilePicker();
  }
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
 * 允许文件拖入并显示拖放激活状态。
 *
 * @param {DragEvent} event 文件拖入区域事件
 * @returns {void}
 */
function handleDragOver(event) {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
}

/**
 * 在文件离开拖放区域时恢复默认状态。
 *
 * @returns {void}
 */
function handleDragLeave() {
  elements.dropZone.classList.remove("is-dragging");
}

/**
 * 接收用户拖入的第一张图片并阻止浏览器直接打开文件。
 *
 * @param {DragEvent} event 文件放入区域事件
 * @returns {void}
 */
function handleDrop(event) {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  selectFile(event.dataTransfer?.files?.[0] || null);
}

/**
 * 页面退出前释放当前会话创建的图片对象 URL。
 *
 * @returns {void}
 */
function handleBeforeUnload() {
  revokeObjectUrl(state.sourceUrl);
  revokeObjectUrl(state.resultUrl);
}

// 1. 文件选择与拖放：键盘和鼠标均可触发同一选择流程。
elements.dropZone.addEventListener("click", openFilePicker);
elements.dropZone.addEventListener("keydown", handleDropZoneKeydown);
elements.replaceButton.addEventListener("click", openFilePicker);
elements.imageInput.addEventListener("change", handleFileInputChange);
elements.dropZone.addEventListener("dragover", handleDragOver);
elements.dropZone.addEventListener("dragleave", handleDragLeave);
elements.dropZone.addEventListener("drop", handleDrop);

// 2. 处理与下载：授权变化实时控制提交按钮可用状态。
elements.authorizedInput.addEventListener("change", updateSubmitState);
elements.uploadForm.addEventListener("submit", handleSubmit);
elements.downloadButton.addEventListener("click", downloadResult);

// 3. 页面退出：释放两个对象 URL，避免浏览器保留图片内存。
window.addEventListener("beforeunload", handleBeforeUnload);
