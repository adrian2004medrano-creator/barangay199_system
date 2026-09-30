import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
});

// Attach auth token automatically once login is wired up
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("barangay199_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// Example usage once backend routes exist:
// export const getYouthList = () => api.get("/youth");
// export const getYouthById = (id) => api.get(`/youth/${id}`);
// export const login = (credentials) => api.post("/auth/login", credentials);
