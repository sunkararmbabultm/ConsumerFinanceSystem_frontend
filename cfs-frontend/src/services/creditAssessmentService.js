import api from "../apis/api";

export async function createCreditAssessment(assessment) {
  const { data } = await api.post("/api/credit-assessments", assessment);
  return data;
}

export async function listCreditAssessments() {
  const { data } = await api.get("/api/credit-assessments");
  return data;
}

export async function listCreditAssessmentsByStatus(status) {
  const { data } = await api.get(`/api/credit-assessments/status/${encodeURIComponent(status)}`);
  return data;
}

export async function getCreditAssessment(assessmentId) {
  const { data } = await api.get(`/api/credit-assessments/${encodeURIComponent(assessmentId)}`);
  return data;
}

export async function getAssessmentForApplication(applicationId) {
  const { data } = await api.get(`/api/credit-assessments/application/${encodeURIComponent(applicationId)}`);
  return data;
}