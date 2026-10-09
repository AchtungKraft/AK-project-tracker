import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { saveClientAccount, CLIENT_ACCOUNTS_KEY } from "@/lib/clientAccounts";

const inputCls = "bg-gray-800 border-gray-700 text-white";

export default function ClientAccountFormModal({ account, onClose }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: account?.name || "",
    status: account?.status || "active",
    primary_contact_name: account?.primary_contact_name || "",
    email: account?.email || "",
    phone: account?.phone || "",
    notes: account?.notes || "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const mutation = useMutation({
    mutationFn: () => saveClientAccount(account?.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLIENT_ACCOUNTS_KEY });
      queryClient.invalidateQueries({ queryKey: ["clientAccount", account?.id] });
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e) => { e.preventDefault(); setError(""); mutation.mutate(); };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader><DialogTitle>{account ? "Edit Client Account" : "New Client Account"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Organization Name *</Label><Input value={form.name} onChange={set("name")} className={inputCls} required /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Primary Contact</Label><Input value={form.primary_contact_name} onChange={set("primary_contact_name")} className={inputCls} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={set("email")} className={inputCls} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={set("phone")} className={inputCls} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={set("notes")} className={inputCls} rows={3} /></div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-red-600 hover:bg-red-700">
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}