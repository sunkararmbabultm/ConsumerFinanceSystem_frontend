import api from "../apis/api";

export async function getEmiScheduleForApplication(applicationId) {
  const { data } = await api.get(`/api/emi/schedules/application/${encodeURIComponent(applicationId)}`);
  return data;
}

export async function listEmiInstallments(loanAccountId) {
  const { data } = await api.get(`/api/emi/schedules/${encodeURIComponent(loanAccountId)}/installments`);
  return data;
}