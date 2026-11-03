import api from "../apis/api";
import { getCustomerByUserId } from "./customerService";

export async function createLoanProduct(product) {
  const { data } = await api.post("/api/loan-products", product);
  return data;
}

export async function listLoanProducts() {
  const { data } = await api.get("/api/loan-products");
  return data;
}

export async function getLoanProduct(productId) {
  const { data } = await api.get(`/api/loan-products/${encodeURIComponent(productId)}`);
  return data;
}

export async function createDraftFinanceApplication(application) {
  const { data } = await api.post("/api/applications", application);
  return data;
}

export async function listAssessmentQueue() {
  const { data } = await api.get("/api/applications/assessment-queue");
  return data;
}

export async function getAssessmentContext(applicationId) {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/assessment-context`);
  return data;
}

export async function getFinanceApplication(applicationId) {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}`);
  return data;
}

export async function listCustomerApplications(customerId) {
  const { data } = await api.get(`/api/applications/customer/${encodeURIComponent(customerId)}`);
  return data;
}

export async function submitFinanceApplication(applicationId) {
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/submit`);
  return data;
}

export async function getApplicationHistory(applicationId) {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/history`);
  return data;
}

export async function listWorkspaceApplications(isAdmin, userId) {
  if (isAdmin) {
    throw new Error("The current API reference does not define an admin-wide application list endpoint.");
  }
  const customer = await getCustomerByUserId(userId);
  return listCustomerApplications(customer.customerId);
}