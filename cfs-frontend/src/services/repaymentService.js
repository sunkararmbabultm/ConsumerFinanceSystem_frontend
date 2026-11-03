import api from "../apis/api";

export async function createRepayment(repayment) {
  const { data } = await api.post("/api/emi/repayments", repayment);
  return data;
}

export async function listApplicationRepayments(applicationId) {
  const { data } = await api.get(`/api/emi/repayments/application/${encodeURIComponent(applicationId)}`);
  return data;
}

export async function getRepayment(repaymentId) {
  const { data } = await api.get(`/api/emi/repayments/${encodeURIComponent(repaymentId)}`);
  return data;
}