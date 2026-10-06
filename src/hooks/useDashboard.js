import { useCallback, useEffect, useState } from "react";
import api from "../lib/api.js";

export function useDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data: payload } = await api.get("/users/dashboard");
      setData(payload);
      setError(null);
      return payload;
    } catch (e) {
      setError(e.message || "Failed to load dashboard data");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .get("/users/dashboard")
      .then(({ data: payload }) => {
        if (!active) return;
        setData(payload);
        setError(null);
      })
      .catch((e) => {
        if (active) setError(e.message || "Failed to load dashboard data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error, refresh };
}