import { useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

/**
 * File state machine statuses:
 * "queued" → "uploading" → "uploaded" | "failed"
 */

// ── Retry wrapper — only retries transient failures ──────────────────
async function uploadWithRetry(fn, { retries = 2, delay = 600 } = {}) {
  try {
    return await fn();
  } catch (err) {
    const message = String(err?.message || "");
    const isRetryable =
      err?.status === 429 ||
      message.includes("429") ||
      message.includes("TIMEOUT") ||
      message.includes("network") ||
      err?.name === "FetchError";

    if (retries > 0 && isRetryable) {
      const jitter = Math.random() * 200;
      await new Promise(r => setTimeout(r, delay + jitter));
      return uploadWithRetry(fn, { retries: retries - 1, delay: delay * 2 });
    }
    throw err;
  }
}

// ── Controlled concurrency — max 2 concurrent uploads ────────────────
async function runBatched(tasks, batchSize = 2, delay = 150) {
  if (!tasks || tasks.length === 0) return [];
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
    if (i + batchSize < tasks.length) {
      const jitter = Math.random() * 150;
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }
  return results;
}

// ── Classify upload errors ───────────────────────────────────────────
function classifyUploadError(err) {
  const msg = String(err?.message || "").toLowerCase();
  if (err?.status === 429 || msg.includes("429") || msg.includes("rate limit")) return "RATE_LIMIT";
  if (msg.includes("timeout")) return "TIMEOUT";
  if (msg.includes("too large") || msg.includes("payload") || msg.includes("413")) return "FILE_TOO_LARGE";
  if (msg.includes("unsupported") || msg.includes("type")) return "UNSUPPORTED_TYPE";
  return "UNKNOWN";
}

const ERROR_LABELS = {
  RATE_LIMIT: "Upload temporarily unavailable. Retry shortly.",
  TIMEOUT: "Upload timed out. Please retry.",
  FILE_TOO_LARGE: "File is too large.",
  UNSUPPORTED_TYPE: "File type not supported.",
  UNKNOWN: "Upload failed.",
};

let _localIdCounter = 0;
function nextLocalId() {
  return `file_${Date.now()}_${++_localIdCounter}`;
}

/**
 * useFileUploader — manages file upload state machine with batched concurrency.
 *
 * Returns:
 *   files         — array of { local_id, file, name, size, status, error_message, result_url }
 *   addFiles      — (fileList, uploadType) → queue and immediately upload
 *   retryFailed   — retry all failed files
 *   removeFile    — remove a file by local_id
 *   clearAll      — reset everything
 *   clearUploaded — remove only successfully uploaded files from state
 *   isUploading   — true while any file is uploading
 *   uploadedUrls  — convenience: array of result_url for "uploaded" files
 *   uploadedFileObjects — convenience: array of { name, url } for "uploaded" files (for file type)
 *   failedCount   — number of failed files
 */
export default function useFileUploader() {
  const [files, setFiles] = useState([]);
  const isUploadingRef = useRef(false);

  const uploadSingleFile = useCallback(async (entry) => {
    setFiles(prev => prev.map(f =>
      f.local_id === entry.local_id ? { ...f, status: "uploading", error_message: "" } : f
    ));

    try {
      const result = await uploadWithRetry(
        () => base44.integrations.Core.UploadFile({ file: entry.file })
      );
      setFiles(prev => prev.map(f =>
        f.local_id === entry.local_id
          ? { ...f, status: "uploaded", result_url: result.file_url, error_message: "" }
          : f
      ));
      return { local_id: entry.local_id, success: true, url: result.file_url };
    } catch (err) {
      const errorType = classifyUploadError(err);
      setFiles(prev => prev.map(f =>
        f.local_id === entry.local_id
          ? { ...f, status: "failed", error_message: ERROR_LABELS[errorType] || ERROR_LABELS.UNKNOWN }
          : f
      ));
      return { local_id: entry.local_id, success: false, errorType };
    }
  }, []);

  const processQueue = useCallback(async (entries) => {
    if (entries.length === 0) return;
    isUploadingRef.current = true;

    const tasks = entries.map(entry => () => uploadSingleFile(entry));
    await runBatched(tasks, 2, 150);

    isUploadingRef.current = false;
  }, [uploadSingleFile]);

  const addFiles = useCallback((fileList) => {
    const rawFiles = Array.from(fileList || []);
    if (rawFiles.length === 0) return;

    const newEntries = rawFiles.map(file => ({
      local_id: nextLocalId(),
      file,
      name: file.name,
      size: file.size,
      status: "queued",
      error_message: "",
      result_url: null,
    }));

    setFiles(prev => [...prev, ...newEntries]);

    // Start uploading immediately
    processQueue(newEntries);
  }, [processQueue]);

  const retryFailed = useCallback(() => {
    setFiles(prev => {
      const failedEntries = prev.filter(f => f.status === "failed");
      if (failedEntries.length === 0) return prev;

      // Reset failed to queued
      const updated = prev.map(f =>
        f.status === "failed" ? { ...f, status: "queued", error_message: "" } : f
      );

      // Process the failed ones
      processQueue(failedEntries);
      return updated;
    });
  }, [processQueue]);

  const removeFile = useCallback((localId) => {
    setFiles(prev => prev.filter(f => f.local_id !== localId));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    isUploadingRef.current = false;
  }, []);

  const clearUploaded = useCallback(() => {
    setFiles(prev => prev.filter(f => f.status !== "uploaded"));
  }, []);

  const isUploading = files.some(f => f.status === "uploading" || f.status === "queued");
  const uploadedUrls = files.filter(f => f.status === "uploaded" && f.result_url).map(f => f.result_url);
  const uploadedFileObjects = files
    .filter(f => f.status === "uploaded" && f.result_url)
    .map(f => ({ name: f.name, url: f.result_url }));
  const failedCount = files.filter(f => f.status === "failed").length;

  return {
    files,
    addFiles,
    retryFailed,
    removeFile,
    clearAll,
    clearUploaded,
    isUploading,
    uploadedUrls,
    uploadedFileObjects,
    failedCount,
  };
}