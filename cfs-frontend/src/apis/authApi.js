import api from "./api";

export const registerCustomer = async (customerData) => {
  const { data } = await api.post("/api/auth/register", customerData);
  return data;
};

export const loginCustomer = async (loginData) => {
  const { data } = await api.post("/api/auth/login", loginData);
  return data;
};

export const createInternalUser = async (userData) => {
  const { data } = await api.post("/api/admin/users", userData);
  return data;
};