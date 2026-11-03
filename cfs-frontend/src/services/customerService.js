import api from "../apis/api";

export async function createCustomer(customer) {
  const { data } = await api.post("/api/customers", customer);
  return data;
}

export async function getCustomer(customerId) {
  const { data } = await api.get(`/api/customers/${encodeURIComponent(customerId)}`);
  return data;
}

export async function getCustomerByUserId(userId) {
  const { data } = await api.get(`/api/customers/user/${encodeURIComponent(userId)}`);
  return data;
}

export async function getCustomerAddresses(customerId) {
  const { data } = await api.get(`/api/customers/${encodeURIComponent(customerId)}/addresses`);
  return data;
}

export async function getCustomerEmployment(customerId) {
  const { data } = await api.get(`/api/customers/${encodeURIComponent(customerId)}/employment`);
  return data;
}

export async function getCustomerBankAccounts(customerId) {
  const { data } = await api.get(`/api/customers/${encodeURIComponent(customerId)}/bank-accounts`);
  return data;
}

export async function getCustomerDocuments(customerId) {
  const { data } = await api.get(`/api/customers/${encodeURIComponent(customerId)}/documents`);
  return data;
}

export async function getCustomerOnboardingStatus(customerId) {
  const { data } = await api.get(`/api/customers/${encodeURIComponent(customerId)}/onboarding-status`);
  return data;
}

export async function requestCustomerKycReview(customerId) {
  const { data } = await api.post(`/api/customers/${encodeURIComponent(customerId)}/kyc-review`);
  return data;
}

export async function createCustomerAddress(customerId, address) {
  const { data } = await api.post(`/api/customers/${encodeURIComponent(customerId)}/addresses`, address);
  return data;
}

export async function createCustomerEmployment(customerId, employment) {
  const { data } = await api.post(`/api/customers/${encodeURIComponent(customerId)}/employment`, employment);
  return data;
}

export async function createCustomerBankAccount(customerId, bankAccount) {
  const { data } = await api.post(`/api/customers/${encodeURIComponent(customerId)}/bank-accounts`, bankAccount);
  return data;
}

export async function createCustomerDocument(customerId, document) {
  const { data } = await api.post(`/api/customers/${encodeURIComponent(customerId)}/documents`, document);
  return data;
}