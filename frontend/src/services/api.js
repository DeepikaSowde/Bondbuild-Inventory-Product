import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bb_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("bb_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export default api;
