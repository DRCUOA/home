import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

export function useList<T>(key: string, path: string, params?: Record<string, string>) {
  const qs = params
    ? "?" + new URLSearchParams(params).toString()
    : "";
  return useQuery<{ data: T[]; total: number }>({
    queryKey: [key, params],
    queryFn: () => apiGet(`${path}${qs}`),
  });
}

export function useDetail<T>(key: string, path: string, id: string | undefined) {
  return useQuery<{ data: T }>({
    queryKey: [key, id],
    queryFn: () => apiGet(`${path}/${id}`),
    enabled: !!id,
  });
}

export function useCreate<T>(key: string, path: string) {
  const qc = useQueryClient();
  return useMutation<{ data: T }, Error, any>({
    mutationFn: (data) => apiPost(path, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
  });
}

export function useUpdate<T>(key: string, path: string) {
  const qc = useQueryClient();
  return useMutation<{ data: T }, Error, { id: string; data: any }>({
    mutationFn: ({ id, data }) => apiPatch(`${path}/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
  });
}

export function useRemove(key: string, path: string) {
  const qc = useQueryClient();
  return useMutation<any, Error, string>({
    mutationFn: (id) => apiDelete(`${path}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
  });
}
