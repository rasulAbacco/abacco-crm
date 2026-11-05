import { useEffect, useState } from "react";
import api from "../../../services/axiosInstance";

export const leadService = {
  get: (id) => api.get(`/leads/${id}`),
  create: (b) => api.post("/leads", b),
  update: (id, b) => api.put(`/leads/${id}`, b),
  convert: (id, b) => api.post(`/leads/${id}/convert`, b),
  options: () => api.get("/leads/options"),
  saveOptions: (b) => api.put("/leads/options", b),
  emailAudience: (b) => api.post("/leads/email-audience", b),
};

/** Editable Response Status / Call Status lists (Settings live on the server). */
export function useLeadOptions() {
  const [opts, setOpts] = useState({ responseStatuses: [], callStatuses: [] });
  const load = () =>
    leadService
      .options()
      .then((r) => setOpts(r.data.data))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  return [opts, load, setOpts];
}

// Colour per response status (unknown/custom values are grey).
const TONE = {
  active: "green",
  responded: "blue",
  interested: "emerald",
  converted: "emerald",
  budget: "amber",
  "not responding": "amber",
  "no response": "amber",
  "leave out": "gray",
  "not interested": "red",
};
export const responseTone = (v) =>
  TONE[String(v ?? "").toLowerCase()] ?? "gray";
