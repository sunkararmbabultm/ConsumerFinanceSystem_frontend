import api from "../apis/api";

export async function createApproval(approval) {
  const { data } = await api.post("/api/approvals", approval);
  return data;
}

export async function getApproval(approvalId) {
  const { data } = await api.get(`/api/approvals/${encodeURIComponent(approvalId)}`);
  return data;
}

export async function getApprovalForApplication(applicationId) {
  const { data } = await api.get(`/api/approvals/application/${encodeURIComponent(applicationId)}`);
  return data;
}

export async function listApprovals() {
  const { data } = await api.get("/api/approvals");
  return data;
}

export async function listApprovalsByStatus(status) {
  const { data } = await api.get(`/api/approvals/status/${encodeURIComponent(status)}`);
  return data;
}

export async function listApprovalsByReviewer(reviewedBy) {
  const { data } = await api.get("/api/approvals/reviewer", {
    params: { reviewedBy },
  });
  return data;
}