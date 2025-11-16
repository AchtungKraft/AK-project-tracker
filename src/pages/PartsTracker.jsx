import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Truck, MapPin, List, FolderTree } from "lucide-react";
import PartsMasterList from "../components/parts/PartsMasterList";
import NeedToBuy from "../components/parts/NeedToBuy";
import OnOrder from "../components/parts/OnOrder";
import InventoryLocations from "../components/parts/InventoryLocations";
import BuildsDashboard from "../components/parts/BuildsDashboard";

export default function PartsTracker() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
            PARTS TRACKER
          </h1>
          <p className="text-sm text-gray-400">Manage parts inventory, orders, and build assignments</p>
        </div>

        <Tabs defaultValue="parts-master" className="w-full">
          <TabsList className="bg-gray-900/50 border border-red-900/30 flex-wrap h-auto">
            <TabsTrigger value="parts-master" className="gap-2">
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">PARTS MASTER</span>
              <span className="sm:hidden">MASTER</span>
            </TabsTrigger>
            <TabsTrigger value="need-to-buy" className="gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">NEED TO BUY</span>
              <span className="sm:hidden">BUY</span>
            </TabsTrigger>
            <TabsTrigger value="on-order" className="gap-2">
              <Truck className="w-4 h-4" />
              <span className="hidden sm:inline">ON ORDER</span>
              <span className="sm:hidden">ORDERS</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">LOCATIONS</span>
              <span className="sm:hidden">LOCATIONS</span>
            </TabsTrigger>
            <TabsTrigger value="builds" className="gap-2">
              <FolderTree className="w-4 h-4" />
              <span className="hidden sm:inline">BUILDS</span>
              <span className="sm:hidden">BUILDS</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="parts-master" className="mt-4">
            <PartsMasterList />
          </TabsContent>

          <TabsContent value="need-to-buy" className="mt-4">
            <NeedToBuy />
          </TabsContent>

          <TabsContent value="on-order" className="mt-4">
            <OnOrder />
          </TabsContent>

          <TabsContent value="inventory" className="mt-4">
            <InventoryLocations />
          </TabsContent>

          <TabsContent value="builds" className="mt-4">
            <BuildsDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}