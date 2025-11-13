import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

export default function NeedToBuy() {
  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          Need to Buy
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <p className="text-gray-400 text-center py-8">
          Need to Buy view coming soon...
        </p>
      </CardContent>
    </Card>
  );
}