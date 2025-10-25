// API 配置
const API_CONFIG = {
  uploadEndpoint: "/api/upload",
  statusEndpoint: "/api/status",
  resultEndpoint: "/api/result",
};

// 应用状态
const appState = {
  selectedFile: null,
  taskId: null,
  startTime: null,
  processedVideoBlob: null,
  pollInterval: null,
  pollRetryCount: 0,
  maxPollRetries: 120,
};

// DOM 元素引用
const elements = {
  videoInput: document.getElementById("videoInput"),
  uploadStatus: document.getElementById("uploadStatus"),
  previewSection: document.getElementById("previewSection"),
  previewVideo: document.getElementById("previewVideo"),
  fileName: document.getElementById("fileName"),
  fileSize: document.getElementById("fileSize"),
  previewUploadBtn: document.getElementById("previewUploadBtn"),
  reselectBtn: document.getElementById("reselectBtn"),
  statusSection: document.getElementById("statusSection"),
  statusIcon: document.getElementById("statusIcon"),
  statusText: document.getElementById("statusText"),
  loadingSpinner: document.getElementById("loadingSpinner"),
  taskId: document.getElementById("taskId"),
  processingTime: document.getElementById("processingTime"),
  resultSection: document.getElementById("resultSection"),
  resultVideo: document.getElementById("resultVideo"),
  downloadBtn: document.getElementById("downloadBtn"),
  resetBtn: document.getElementById("resetBtn"),
  errorToast: document.getElementById("errorToast"),
  errorMessage: document.getElementById("errorMessage"),
  errorClose: document.getElementById("errorClose"),
  fileInputLabel: document.querySelector(".file-input-label"),
  uploadText: document.querySelector(".upload-text"),
  uploadSection: document.querySelector(".upload-section"),
};

// 工具函数
const utils = {
  formatFileSize: (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },

  formatTime: (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}分${seconds % 60}秒`;
  },

  revokeVideoURL: (videoElement) => {
    if (videoElement.src) {
      URL.revokeObjectURL(videoElement.src);
      videoElement.src = "";
    }
  },
};

// 状态管理
const stateManager = {
  reset: () => {
    if (appState.pollInterval) {
      clearInterval(appState.pollInterval);
      appState.pollInterval = null;
    }
    Object.assign(appState, {
      selectedFile: null,
      taskId: null,
      startTime: null,
      processedVideoBlob: null,
      pollRetryCount: 0,
    });
  },

  cleanupVideos: () => {
    utils.revokeVideoURL(elements.previewVideo);
    utils.revokeVideoURL(elements.resultVideo);
  },
};

// UI 管理
const uiManager = {
  showSection: (sectionName) => {
    const sections = {
      upload: elements.uploadSection,
      preview: elements.previewSection,
      status: elements.statusSection,
      result: elements.resultSection,
    };

    Object.entries(sections).forEach(([name, section]) => {
      section.style.display = name === sectionName ? "block" : "none";
    });

    if (sections[sectionName]) {
      sections[sectionName].scrollIntoView({ behavior: "smooth" });
    }
  },

  showError: (message, duration = 5000) => {
    elements.errorMessage.textContent = message;
    elements.errorToast.style.display = "flex";
    setTimeout(() => uiManager.hideError(), duration);
  },

  hideError: () => {
    elements.errorToast.style.display = "none";
  },

  updateUploadStatus: (message, type = "") => {
    elements.uploadStatus.textContent = message;
    elements.uploadStatus.className = `status-message ${type}`;
  },

  updateProcessingStatus: (status, message) => {
    const statusConfig = {
      waiting: { text: "等待处理...", icon: "waiting" },
      processing: { text: "正在处理...", icon: "processing" },
      completed: { text: "处理完成！", icon: "completed" },
      failed: { text: "处理失败", icon: "error" },
    };

    const config = statusConfig[status] || statusConfig.processing;
    elements.statusText.textContent = message || config.text;
    elements.statusIcon.className = `status-icon ${config.icon}`;

    if (appState.startTime) {
      const elapsed = Date.now() - appState.startTime;
      elements.processingTime.textContent = `处理时间: ${utils.formatTime(
        elapsed
      )}`;
    }
  },

  updateFileLabel: (file) => {
    if (file) {
      elements.fileInputLabel.classList.add("has-file");
      elements.uploadText.textContent = file.name;
    } else {
      elements.fileInputLabel.classList.remove("has-file");
      elements.uploadText.textContent = "选择MP4文件";
    }
  },

  setButtonState: (button, disabled) => {
    button.disabled = disabled;
  },

  toggleSpinner: (show) => {
    elements.loadingSpinner.style.display = show ? "block" : "none";
  },
};

// 文件验证
const fileValidator = {
  validate: (file) => {
    if (!file.type.includes("video/mp4")) {
      return { valid: false, error: "请选择 MP4 格式的视频文件" };
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return { valid: false, error: "文件大小不能超过 100MB" };
    }

    return { valid: true };
  },
};

// 文件处理
const fileHandler = {
  select: (event) => {
    const file = event.target.files[0];
    if (!file) {
      fileHandler.reset();
      return;
    }

    const validation = fileValidator.validate(file);
    if (!validation.valid) {
      uiManager.showError(validation.error);
      fileHandler.reset();
      return;
    }

    appState.selectedFile = file;
    fileHandler.showPreview(file);
  },

  showPreview: (file) => {
    stateManager.cleanupVideos();

    const fileURL = URL.createObjectURL(file);
    elements.previewVideo.src = fileURL;
    elements.fileName.textContent = `文件名: ${file.name}`;
    elements.fileSize.textContent = `文件大小: ${utils.formatFileSize(
      file.size
    )}`;

    uiManager.showSection("preview");
    uiManager.updateFileLabel(file);
    uiManager.setButtonState(elements.previewUploadBtn, false);
  },

  reset: () => {
    appState.selectedFile = null;
    elements.videoInput.value = "";
    uiManager.updateFileLabel(null);
    uiManager.updateUploadStatus("", "");
  },

  reselect: () => {
    elements.videoInput.value = "";
    elements.videoInput.click();
  },
};

// 视频上传
const videoUploader = {
  upload: async () => {
    if (!appState.selectedFile) {
      uiManager.showError("请先选择要上传的视频文件");
      return;
    }

    uiManager.setButtonState(elements.previewUploadBtn, true);
    uiManager.updateUploadStatus("正在上传...", "uploading");

    try {
      const formData = new FormData();
      formData.append("video", appState.selectedFile);

      const response = await fetch(API_CONFIG.uploadEndpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success || !result.taskId) {
        throw new Error(result.message || "上传响应格式错误");
      }

      appState.taskId = result.taskId;
      appState.startTime = Date.now();

      uiManager.updateUploadStatus("上传成功，正在处理视频...", "success");
      videoUploader.showProcessing();
      videoUploader.startPolling();
    } catch (error) {
      console.error("上传错误:", error);
      uiManager.showError(error.message || "上传失败，请重试");
      uiManager.updateUploadStatus("上传失败", "error");
      uiManager.setButtonState(elements.previewUploadBtn, false);
    }
  },

  showProcessing: () => {
    uiManager.showSection("status");
    elements.taskId.textContent = `任务ID: ${appState.taskId}`;
    uiManager.updateProcessingStatus("processing");
    uiManager.toggleSpinner(true);
  },

  startPolling: () => {
    appState.pollRetryCount = 0;
    videoUploader.poll();
    appState.pollInterval = setInterval(videoUploader.poll, 500);
  },

  poll: async () => {
    if (!appState.taskId) return;

    try {
      const response = await fetch(
        `${API_CONFIG.statusEndpoint}?id=${appState.taskId}`
      );

      if (!response.ok) {
        throw new Error(`状态查询失败: ${response.status}`);
      }

      const statusData = await response.json();
      appState.pollRetryCount = 0;

      uiManager.updateProcessingStatus(statusData.status);

      if (statusData.status === "completed") {
        videoUploader.handleComplete();
      } else if (statusData.status === "failed") {
        videoUploader.handleFailed(statusData.message || "处理失败");
      }
    } catch (error) {
      console.error("状态查询错误:", error);
      appState.pollRetryCount++;

      if (appState.pollRetryCount >= appState.maxPollRetries) {
        videoUploader.handleFailed(
          "状态查询失败次数过多，请检查网络连接或重新上传"
        );
      } else if (appState.pollRetryCount >= 3) {
        uiManager.updateProcessingStatus(
          "error",
          `网络不稳定，正在重试... (${appState.pollRetryCount}/${appState.maxPollRetries})`
        );
      }
    }
  },

  handleComplete: () => {
    clearInterval(appState.pollInterval);
    appState.pollInterval = null;
    videoUploader.fetchResult();
  },

  handleFailed: (message) => {
    clearInterval(appState.pollInterval);
    appState.pollInterval = null;
    uiManager.showError(message);
    uiManager.setButtonState(elements.previewUploadBtn, false);
    uiManager.updateUploadStatus("处理失败，请重新上传", "error");
  },

  fetchResult: async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.resultEndpoint}?id=${appState.taskId}`
      );

      if (!response.ok) {
        throw new Error(`获取处理结果失败: ${response.status}`);
      }

      const videoBlob = await response.blob();
      appState.processedVideoBlob = videoBlob;

      uiManager.toggleSpinner(false);
      setTimeout(() => videoUploader.showResult(videoBlob), 500);
    } catch (error) {
      console.error("获取处理结果错误:", error);
      uiManager.showError("获取处理结果失败，请重试");
      uiManager.toggleSpinner(false);
      uiManager.setButtonState(elements.previewUploadBtn, false);
      uiManager.updateUploadStatus("获取结果失败", "error");
    }
  },

  showResult: (videoBlob) => {
    const videoURL = URL.createObjectURL(videoBlob);
    elements.resultVideo.src = videoURL;
    uiManager.showSection("result");
    uiManager.updateUploadStatus("处理完成！", "success");
  },
};

// 下载处理
const downloadHandler = {
  download: () => {
    if (!appState.processedVideoBlob) {
      uiManager.showError("没有可下载的视频文件");
      return;
    }

    const downloadURL = URL.createObjectURL(appState.processedVideoBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadURL;

    const originalName = appState.selectedFile
      ? appState.selectedFile.name.replace(/\.[^/.]+$/, "")
      : "processed_video";
    downloadLink.download = `${originalName}_processed.mp4`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setTimeout(() => URL.revokeObjectURL(downloadURL), 100);
  },
};

// 事件监听器
const eventListeners = {
  init: () => {
    elements.videoInput.addEventListener("change", fileHandler.select);
    elements.previewUploadBtn.addEventListener("click", videoUploader.upload);
    elements.reselectBtn.addEventListener("click", fileHandler.reselect);
    elements.downloadBtn.addEventListener("click", downloadHandler.download);
    elements.resetBtn.addEventListener("click", fileHandler.reselect);
    elements.errorClose.addEventListener("click", uiManager.hideError);

    // 键盘快捷键
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "u") {
        event.preventDefault();
        elements.videoInput.click();
      }
      if (event.key === "Escape") {
        uiManager.hideError();
      }
    });

    // 可访问性
    eventListeners.setupAccessibility();
  },

  setupAccessibility: () => {
    const ariaLabels = {
      previewUploadBtn: "上传视频文件",
      downloadBtn: "下载处理后的视频",
      resetBtn: "重新开始上传",
      errorClose: "关闭错误消息",
    };

    Object.entries(ariaLabels).forEach(([key, label]) => {
      elements[key].setAttribute("aria-label", label);
    });

    elements.statusText.setAttribute("aria-live", "polite");
    elements.uploadStatus.setAttribute("aria-live", "polite");

    elements.videoInput.addEventListener("focus", () => {
      elements.fileInputLabel.style.outline = "2px solid #002EAD";
      elements.fileInputLabel.style.outlineOffset = "2px";
    });

    elements.videoInput.addEventListener("blur", () => {
      elements.fileInputLabel.style.outline = "none";
    });
  },
};

// 初始化应用
const app = {
  init: () => {
    eventListeners.init();
    uiManager.setButtonState(elements.previewUploadBtn, true);
    console.log("视频处理应用已初始化");
  },
};

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", app.init);
