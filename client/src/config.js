const rawApiUrl = import.meta.env.VITE_API_URL;

export const API_URL =
  rawApiUrl && rawApiUrl.trim() !== ""
    ? rawApiUrl.trim().replace(/\/+$/, "")
    : import.meta.env.PROD
    ? ""
    : "http://localhost:3001";

