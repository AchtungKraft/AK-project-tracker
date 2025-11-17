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
          <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
            <TabsList className="bg-gray-900/50 border border-red-900/30 inline-flex md:flex md:flex-wrap h-auto min-w-max md:min-w-0 md:w-full">
              <TabsTrigger value="parts-master" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">PARTS MASTER</span>
                <span className="sm:hidden">MASTER</span>
              </TabsTrigger>
              <TabsTrigger value="need-to-buy" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                <ShoppingCart className="w-4 h-4" />
                <span className="hidden sm:inline">NEED TO BUY</span>
                <span className="sm:hidden">BUY</span>
              </TabsTrigger>
              <TabsTrigger value="on-order" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                <Truck className="w-4 h-4" />
                <span className="hidden sm:inline">ON ORDER</span>
                <span className="sm:hidden">ORDERS</span>
              </TabsTrigger>
              <TabsTrigger value="inventory" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                <MapPin className="w-4 h-4" />
                <span>LOCATIONS</span>
              </TabsTrigger>
              <TabsTrigger value="builds" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                <FolderTree className="w-4 h-4" />
                <span>BUILDS</span>
              </TabsTrigger>
            </TabsList>
          </div>

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