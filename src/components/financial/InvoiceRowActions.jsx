import React, { useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import DeleteDraftInvoiceDialog from "@/components/financial/DeleteDraftInvoiceDialog";
import EditDraftLinesDialog from "@/components/financial/EditDraftLinesDialog";
import AddDraftLinesDialog from "@/components/financial/AddDraftLinesDialog";

// Visible row actions. Drafts: Review, plus Add lines, Edit and Delete for admins (the server re-checks everything).
export default function InvoiceRowActions({ invoice, onOpen, onDeleted }) {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [edit, setEdit] = useState(false);
  const [add, setAdd] = useState(false);
  const isDraft = invoice.status === "draft";
  const canManage = isDraft && user?.role === "admin";
  return (
    <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onOpen} className="h-8 gap-1 text-gray-200"><Eye className="w-4 h-4" />{isDraft ? "Review" : "Open"}</Button>
      {canManage && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setAdd(true)} className="h-8 gap-1 text-gray-200"><Plus className="w-4 h-4" />Add</Button>
          <Button variant="ghost" size="sm" onClick={() => setEdit(true)} className="h-8 gap-1 text-gray-200"><Pencil className="w-4 h-4" />Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} className="h-8 gap-1 text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" />Delete</Button>
          <AddDraftLinesDialog invoice={invoice} open={add} onOpenChange={setAdd} onSaved={onDeleted} />
          <EditDraftLinesDialog invoice={invoice} open={edit} onOpenChange={setEdit} onSaved={onDeleted} />
          <DeleteDraftInvoiceDialog invoice={invoice} projectName={invoice.project_name} clientName={invoice.client_name}
            open={confirm} onOpenChange={setConfirm} onDeleted={onDeleted} />
        </>
      )}
    </div>
  );
}