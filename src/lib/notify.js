import { toast as uiToast } from "@/components/ui/use-toast";

// Drop-in for the `toast.success / toast.error` call style, routed to the app's mounted toast provider.
export const toast = {
  success: (title) => uiToast({ title }),
  error: (title) => uiToast({ title, variant: "destructive" }),
};