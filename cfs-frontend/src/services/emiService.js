import api from "../apis/api";

export async function generateEmiSchedule(schedule) {
  const { data } = await api.post("/api/emi/schedules", schedule);
  return data;
}

export async function getLoanAccountForApplication(applicationId) {
  const { data } = await api.get(`/api/emi/schedules/application/${encodeURIComponent(applicationId)}`);
  return data;
}

export async function listInstallments(loanAccountId) {
  const { data } = await api.get(`/api/emi/schedules/${encodeURIComponent(loanAccountId)}/installments`);
  return data;
}