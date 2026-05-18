import axios from "axios";

// const API_BASE_URL = "http://103.89.45.75:8001/api";
const API_BASE_URL = "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/* Attach token automatically */

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");

  if (token && config.url !== "/auth/login/") {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
  
export default api;