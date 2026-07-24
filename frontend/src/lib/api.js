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
  updateSupplier: (id, s) => data(axiosClient.put(`/suppliers/${id}`, s)),
  deleteSupplier: (id) => data(axiosClient.delete(`/suppliers/${id}`)),
  poProjects: () => data(axiosClient.get("/po-projects")),
  poProject: (jobNo) => data(axiosClient.get(`/po-projects/${enc(jobNo)}`)),
  addPoProject: (p) => raw(axiosClient.post("/po-projects", p)),
  notifications: () => data(axiosClient.get("/notifications")),
  // Full envelope — the rows are capped at 50 per category, but `unreadByCategory`
  // is the true uncapped count the badges need. See NotificationsContext.
  notificationsFeed: () => raw(axiosClient.get("/notifications")),
  markRead: (id) => raw(axiosClient.post(`/notifications/${id}/read`)),

  // audit trail / history (prices are redacted server-side per role)
  prHistory: (prNo) => data(axiosClient.get(`/purchase-requests/${enc(prNo)}/history`)),
  poHistory: (poNo) => data(axiosClient.get(`/purchase-orders/${enc(poNo)}/history`)),

  // current user's effective PR/PO permissions (for showing/hiding UI)
  myPermissions: () => axiosClient.get("/pr-po-permissions/me/effective").then((r) => r.data.permissions),

  // YOUR existing inventory endpoint ({success,data}); no ?q — filter client-side
  inventory: () => data(axiosClient.get("/inventory")),

  // purchase requests
  prs: (status = "All") => data(axiosClient.get(`/purchase-requests?status=${status}`)),
  pr: (prNo) => data(axiosClient.get(`/purchase-requests/${enc(prNo)}`)),
  createPR: (f) => data(axiosClient.post("/purchase-requests", f)),
  updatePR: (prNo, f) => data(axiosClient.put(`/purchase-requests/${enc(prNo)}`, f)),
  approvePR: (prNo, approvedBy) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/approve`, { approved_by: approvedBy })),
  rejectPR: (prNo, type, reason) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/reject`, { type, reason })),
  assignItems: (prNo, items) => data(axiosClient.put(`/purchase-requests/${enc(prNo)}/items`, { items })),
  sendToFic: (prNo) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/send-to-fic`)),
  // Request for Quotation: { supplierId } for one supplier, { noSupplier: true } for the
  // not-yet-assigned buy lines, or { all: true } for every buy line.
  requestQuote: (prNo, { supplierId, all, noSupplier } = {}) =>
    data(axiosClient.post(`/purchase-requests/${enc(prNo)}/request-quote`,
      all ? { all: true } : noSupplier ? { noSupplier: true } : { supplier_id: supplierId })),
  generatePOs: (prNo) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/generate-pos`)),
  // QS approval — Gate 1 (sourcing, on the PR)
  submitForQs: (prNo) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/submit-for-qs`)),
  qsApprovePr: (prNo) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/qs-approve`)),
  qsSendBackPr: (prNo, reason) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/qs-send-back`, { reason })),
  // Save PR as Draft (enhancement #9): drafts save via createPR/updatePR with draft:true;
  // submit promotes DRAFT → PENDING, delete discards a draft.
  submitPR: (prNo) => data(axiosClient.post(`/purchase-requests/${enc(prNo)}/submit`)),
  deletePR: (prNo) => data(axiosClient.delete(`/purchase-requests/${enc(prNo)}`)),

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

  // per-item attachments — keyed on item_uid, not line_no (line numbers get reused
  // when an item is removed, which would re-home files onto the wrong purchase line)
  listItemAttachments: (prNo) => data(axiosClient.get(`/purchase-requests/${enc(prNo)}/item-attachments`)),
  uploadItemAttachments: (prNo, itemUid, fileList) => {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append("files", f));
    return data(axiosClient.post(`/purchase-requests/${enc(prNo)}/items/${enc(itemUid)}/attachments`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }));
  },
  deleteItemAttachment: (id) => data(axiosClient.delete(`/purchase-requests/item-attachments/${id}`)),
  itemAttachmentDownloadPath: (id) => `/purchase-requests/item-attachments/${id}/download`,

  // PO receiving photos
  uploadReceivePhotos: (poNo, fileList) => {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append("photos", f));
    return data(axiosClient.post(`/purchase-orders/${enc(poNo)}/receive-photos`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }));
  },
  receivePhotos: (poNo) => data(axiosClient.get(`/purchase-orders/${enc(poNo)}/receive-photos`)),
  receivePhotoBlob: (id) => axiosClient.get(`/purchase-orders/receive-photos/${id}/view`, { responseType: "blob" })
    .then((r) => URL.createObjectURL(r.data)),

  // purchase orders
  pos: (params = {}) => data(axiosClient.get(`/purchase-orders?${new URLSearchParams(params)}`)),
  po: (poNo) => data(axiosClient.get(`/purchase-orders/${enc(poNo)}`)),
  createPO: (f) => data(axiosClient.post("/purchase-orders", f)),
  updatePO: (poNo, f) => data(axiosClient.put(`/purchase-orders/${enc(poNo)}`, f)),
  // items: [{ id, unit_price }] — prices an "awaiting pricing" PO, or corrects one
  setPOPrices: (poNo, items) => data(axiosClient.put(`/purchase-orders/${enc(poNo)}/prices`, { items })),
  // QS approval — Gate 2 (price, on the PO) + explicit close
  qsApprovePrice: (poNo) => data(axiosClient.post(`/purchase-orders/${enc(poNo)}/qs-approve-price`)),
  qsSendBackPrice: (poNo, reason) => data(axiosClient.post(`/purchase-orders/${enc(poNo)}/qs-send-back-price`, { reason })),
  closePO: (poNo, notes) => data(axiosClient.post(`/purchase-orders/${enc(poNo)}/close`, { notes })),
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
