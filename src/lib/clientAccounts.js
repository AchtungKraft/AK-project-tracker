import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const CLIENT_ACCOUNTS_KEY = ["clientAccounts"];

export const normalizeAccountName = (name) =>
  (name || "").trim().replace(/\s+/g, " ").toLowerCase();

export function useClientAccounts() {
  return useQuery({
    queryKey: CLIENT_ACCOUNTS_KEY,
    queryFn: async () => {
      const page = await base44.entities.ClientAccount.filter({}, { sort: "name", limit: 500 });
      return page.items;
    },
    staleTime: 60000,
  });
}

export function useIsAdmin() {
  const { data } = useQuery({
    queryKey: ["currentUserRole"],
    queryFn: () => base44.auth.me(),
    staleTime: 300000,
  });
  return data?.role === "admin";
}

// Creates or updates an account, rejecting duplicate names (case/whitespace-insensitive).
export async function saveClientAccount(id, data) {
  const name = (data.name || "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Organization name is required.");
  const name_normalized = normalizeAccountName(name);
  const existing = await base44.entities.ClientAccount.filter({ name_normalized }, { limit: 5, fields: ["name"] });
  if (existing.items.some((a) => a.id !== id)) {
    throw new Error(`A client account named "${name}" already exists.`);
  }
  const payload = { ...data, name, name_normalized };
  return id
    ? base44.entities.ClientAccount.update(id, payload)
    : base44.entities.ClientAccount.create(payload);
}