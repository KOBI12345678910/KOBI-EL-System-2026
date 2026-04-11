import { useState, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { API_URL } from '../utils/format';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = useStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) useStore.getState().logout();
    return Promise.reject(err);
  }
);

export function useApi<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (params?: Record<string, any>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(endpoint, { params });
      setData(res.data);
      return res.data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const post = useCallback(async (body: any) => {
    setLoading(true);
    try {
      const res = await api.post<T>(endpoint, body);
      return res.data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const put = useCallback(async (id: string, body: any) => {
    try {
      const res = await api.put<T>(`${endpoint}/${id}`, body);
      return res.data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error');
      return null;
    }
  }, [endpoint]);

  return { data, loading, error, fetch, post, put };
}

export { api };
