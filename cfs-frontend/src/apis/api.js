import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL || ""),
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cfs-token") || sessionStorage.getItem("cfs-token");
  const tokenType = localStorage.getItem("cfs-token-type") || sessionStorage.getItem("cfs-token-type") || "Bearer";
  if (token) config.headers.Authorization = `${tokenType} ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("cfs-token");
      localStorage.removeItem("cfs-token-type");
      localStorage.removeItem("cfs-user");
      sessionStorage.removeItem("cfs-token");
      sessionStorage.removeItem("cfs-token-type");
      sessionStorage.removeItem("cfs-user");
      window.dispatchEvent(new Event("cfs:unauthorized"));
    }
    return Promise.reject(error);
  },
);

export default api;