import React, { useState } from "react";
import { MoreHorizontal, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import DeleteDraftInvoiceDialog from "@/components/financial/DeleteDraftInvoiceDialog";

// Row menu for the Project Invoices table. Delete Draft only for drafts (server re-checks everything).
export default function InvoiceRowActions({ invoice, onOpen, onDeleted }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Invoice actions"><MoreHorizontal className="w-4 h-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}><ExternalLink className="w-4 h-4 mr-2" />Open invoice</DropdownMenuItem>
          {invoice.status === "draft" && (
            <DropdownMenuItem onClick={() => setConfirm(true)} className="text-red-400"><Trash2 className="w-4 h-4 mr-2" />Delete Draft</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDraftInvoiceDialog
        invoice={invoice}
        projectName={invoice.project_name}
        clientName={invoice.client_name}
        open={confirm}
        onOpenChange={setConfirm}
        onDeleted={onDeleted}
      />
    </div>
  );
}