import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { STORAGE_CATEGORIES_KEY } from "./useStorageCategories";

export const STICKER_ADMIN_KEY = ['stickerCategoryAdmin'];

async function call(payload) {
  const res = await base44.functions.invoke('storageLabels', payload).catch(e => {
    throw new Error(e?.response?.data?.error || e.message);
  });
  const data = res?.data || res;
  if (!data?.success) throw new Error(data?.error || 'Request failed');
  return data;
}

/** Admin list with usage counts. Also creates any missing default categories (idempotent). */
export function useStickerCategoryAdmin(enabled = true) {
  return useQuery({
    queryKey: STICKER_ADMIN_KEY,
    queryFn: async () => (await call({ action: 'list_categories' })).categories,
    enabled,
  });
}

export function useSaveStickerCategory() {
  const queryClient = useQueryClient();
  return async (category) => {
    const data = await call({ action: 'save_category', category });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: STICKER_ADMIN_KEY }),
      queryClient.invalidateQueries({ queryKey: STORAGE_CATEGORIES_KEY }),
    ]);
    return data.category;
  };
}