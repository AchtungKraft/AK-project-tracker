import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, ShoppingCart, Truck, MapPin, List, FolderTree, Activity } from "lucide-react";
import PartsMasterList from "../components/parts/PartsMasterList";
import NeedToBuy from "../components/parts/NeedToBuy";
import OnOrder from "../components/parts/OnOrder";
import InventoryLocations from "../components/parts/InventoryLocations";
import BuildsDashboard from "../components/parts/BuildsDashboard";
import PartCategoriesManager from "../components/parts/PartCategoriesManager";
import ActivityLogView from "../components/parts/ActivityLogView";

export default function PartsTracker() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
            PARTS & BUILD TRACKER
          </h1>
          <p className="text-sm text-gray-400">Manage parts inventory, orders, and build assignments</p>
        </div>

        <Tabs defaultValue="builds" className="w-full">
          <TabsList className="bg-gray-900/50 border border-red-900/30 flex-wrap h-auto">
            <TabsTrigger value="builds" className="gap-2">
              <FolderTree className="w-4 h-4" />
              <span className="hidden sm:inline">Builds Dashboard</span>
              <span className="sm:hidden">Builds</span>
            </TabsTrigger>
            <TabsTrigger value="need-to-buy" className="gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Need to Buy</span>
              <span className="sm:hidden">Buy</span>
            </TabsTrigger>
            <TabsTrigger value="on-order" className="gap-2">
              <Truck className="w-4 h-4" />
              <span className="hidden sm:inline">On Order</span>
              <span className="sm:hidden">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Inventory/Locations</span>
              <span className="sm:hidden">Locations</span>
            </TabsTrigger>
            <TabsTrigger value="parts-master" className="gap-2">
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Parts Master</span>
              <span className="sm:hidden">Master</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Categories</span>
              <span className="sm:hidden">Cats</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Activity Log</span>
              <span className="sm:hidden">Log</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="builds" className="mt-4">
            <BuildsDashboard />
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

          <TabsContent value="parts-master" className="mt-4">
            <PartsMasterList />
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <PartCategoriesManager />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityLogView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}