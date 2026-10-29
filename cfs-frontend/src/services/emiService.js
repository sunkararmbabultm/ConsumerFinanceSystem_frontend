import api from "../apis/api";

export async function createEmiSchedule(schedule) {
  const { data } = await api.post("/api/emi-schedules", schedule);
  return data;
}

export async function getEmiSchedule(loanId) {
  const { data } = await api.get(`/api/emi-schedules/loan/${encodeURIComponent(loanId)}`);
  return data;
}