// lib/api.js — wraps YOUR services/api.js (axios). Matches your {success,data} responses.
import axiosClient from "../services/api";

// your endpoints return { success, data, count } — unwrap to the data array/object
const data = (p) => p.then((r) => r.data?.data ?? r.data);
const raw = (p) => p.then((r) => r.data);
const enc = encodeURIComponent;

export const api = {
  // reference (PR/PO owns these)
  suppliers: () => data(axiosClient.get("/suppliers")),
  addSupplier: (s) => raw(axiosClient.post("/suppliers", s)),
  poProjects: () => data(axiosClient.get("/po-projects")),
  poProject: (jobNo) => data(axiosClient.get(`/po-projects/${enc(jobNo)}`)),
  addPoProject: (p) => raw(axiosClient.post("/po-projects", p)),
  notifications: () => data(axiosClient.get("/notifications")),
  markRead: (id) => raw(axiosClient.post(`/notifications/${id}/read`)),

  // YOUR existing inventory endpoint ({success,data}); no ?q — filter client-side
  inventory: () => data(axiosClient.get("/inventory")),

  // purchase requests
  prs: (status = "All") => data(axiosClient.get(`/purchase-requests?status=${status}`)),
  prNext: () => data(axiosClient.get("/purchase-requests/next-number")),
  pr: (prNo) => data(axiosClient.get(`/purchase-requests/${enc(prNo)}`)),
  createPR: (f) => data(axiosClient.post("/purchase-requests", f)),
  updatePR: (prNo, f) => data(axiosClient.put(`/purchase-requests/${enc(prNo)}`, f)),
  approvePR: (prNo, approvedBy) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/approve`, { approved_by: approvedBy })),
  rejectPR: (prNo, type, reason) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/reject`, { type, reason })),
  assignItems: (prNo, items) => data(axiosClient.put(`/purchase-requests/${enc(prNo)}/items`, { items })),
  sendToFic: (prNo) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/send-to-fic`)),
  reduceStock: (itemId) => data(axiosClient.post(`/purchase-requests/items/${itemId}/reduce-stock`)),
  generatePOs: (prNo) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/generate-pos`)),

  // attachments (whole-PR) — upload uses multipart/form-data
  listAttachments: (prNo) => data(axiosClient.get(`/purchase-requests/${enc(prNo)}/attachments`)),
  uploadAttachments: (prNo, fileList) => {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append("files", f));
    return data(axiosClient.post(`/purchase-requests/${enc(prNo)}/attachments`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }));
  },
  deleteAttachment: (id) => data(axiosClient.delete(`/purchase-requests/attachments/${id}`)),
  attachmentDownloadPath: (id) => `/purchase-requests/attachments/${id}/download`,

  // purchase orders
  pos: (params = {}) => data(axiosClient.get(`/purchase-orders?${new URLSearchParams(params)}`)),
  po: (poNo) => data(axiosClient.get(`/purchase-orders/${enc(poNo)}`)),
  createPO: (f) => data(axiosClient.post("/purchase-orders", f)),
  updatePO: (poNo, f) => data(axiosClient.put(`/purchase-orders/${enc(poNo)}`, f)),
  setDeliveryStage: (poNo, stage) => data(axiosClient.put(`/purchase-orders/${enc(poNo)}/delivery-stage`, { stage })),
  receivePO: (poNo, notes) => data(axiosClient.post(`/purchase-orders/${enc(poNo)}/receive`, { notes })),
  cancelPO: (poNo, reason) => data(axiosClient.post(`/purchase-orders/${enc(poNo)}/cancel`, { reason })),
};

export function apiError(e) {
  return e?.response?.data?.error || e?.message || "Request failed";
}

// Download a file through axios (so the bb_token header is attached), then save it
export async function downloadAttachment(axiosPath, filename) {
  const axiosClient = (await import("../services/api")).default;
  const res = await axiosClient.get(axiosPath, { responseType: "blob" });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url; a.download = filename || "download";
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}
