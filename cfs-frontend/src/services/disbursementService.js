import api from "../apis/api";

export async function listDisbursements() {
  const { data } = await api.get("/api/disbursements");
  return data;
}

export async function createDisbursement(disbursement) {
  const { data } = await api.post("/api/disbursements", disbursement);
  return data;
}

export async function getDisbursement(disbursementId) {
  const { data } = await api.get(`/api/disbursements/${encodeURIComponent(disbursementId)}`);
  return data;
}

export async function getDisbursementForApplication(applicationId) {
  const { data } = await api.get(`/api/disbursements/application/${encodeURIComponent(applicationId)}`);
  return data;
}