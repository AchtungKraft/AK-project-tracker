import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const STORAGE_CATEGORIES_KEY = ['storageLabelCategories'];

export function useStorageCategories() {
  return useQuery({
    queryKey: STORAGE_CATEGORIES_KEY,
    queryFn: () => base44.entities.StorageLabelCategory.list('sort_order', 100),
    staleTime: 60_000,
  });
}

/** Explicit, secured save of container name / storage category. Returns saved rows. */
export async function saveLabelSettings(items) {
  const res = await base44.functions.invoke('storageLabels', { action: 'save_label_settings', items });
  const data = res?.data || res;
  if (!data?.success) throw new Error(data?.error || 'Could not save label settings');
  return data.saved;
}