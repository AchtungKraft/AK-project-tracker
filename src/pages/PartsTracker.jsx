import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Truck, MapPin, List, FolderTree, Warehouse, RefreshCw, Package, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import PartsMasterList from "../components/parts/PartsMasterList";
import NeedToBuy from "../components/parts/NeedToBuy";
import OnOrder from "../components/parts/OnOrder";
import InventoryLocations from "../components/parts/InventoryLocations";
import BuildsDashboard from "../components/parts/BuildsDashboard";
import InventoryExplorerLayout from "../components/inventory/InventoryExplorerLayout";
import InventoryManagement from "../components/inventory/InventoryManagement";
import PurchasingDashboard from "../components/purchasing/PurchasingDashboard";
import EditPartDrawer from "../components/parts/EditPartDrawer";

export default function PartsTracker() {
  const queryClient = useQueryClient();
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handlePartClick = (part) => {
    setSelectedPartId(part.id);
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
                PARTS TRACKER
              </h1>
              <p className="text-sm text-gray-400">Manage parts inventory, orders, and build assignments</p>
            </div>
            <Button
              onClick={async () => {
                setIsRefreshing(true);
                await queryClient.invalidateQueries();
                setIsRefreshing(false);
              }}
              variant="outline"
              size="sm"
              className="border-gray-700 text-white gap-2"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>

          <Tabs defaultValue="parts-master" className="w-full">
            <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
              <TabsList className="bg-gray-900/50 border border-red-900/30 inline-flex md:flex md:flex-wrap h-auto min-w-max md:min-w-0 md:w-full">
                <TabsTrigger value="parts-master" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">PARTS CATALOG</span>
                  <span className="sm:hidden">CATALOG</span>
                </TabsTrigger>
                <TabsTrigger value="inventory" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                  <Package className="w-4 h-4" />
                  <span className="hidden sm:inline">INVENTORY</span>
                  <span className="sm:hidden">INV</span>
                </TabsTrigger>
                <TabsTrigger value="purchasing" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                  <DollarSign className="w-4 h-4" />
                  <span className="hidden sm:inline">PURCHASING</span>
                  <span className="sm:hidden">BUY</span>
                </TabsTrigger>
                <TabsTrigger value="builds" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                  <FolderTree className="w-4 h-4" />
                  <span>BUILDS</span>
                </TabsTrigger>
                <TabsTrigger value="locations" className="gap-1.5 flex-shrink-0 text-xs md:text-sm px-3 md:px-4">
                  <MapPin className="w-4 h-4" />
                  <span>LOCATIONS</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="parts-master" className="mt-4">
              <PartsMasterList onPartClick={handlePartClick} />
            </TabsContent>

            <TabsContent value="inventory" className="mt-4">
              <InventoryManagement onPartClick={handlePartClick} />
            </TabsContent>

            <TabsContent value="purchasing" className="mt-4">
              <PurchasingDashboard />
            </TabsContent>

            <TabsContent value="builds" className="mt-4">
              <BuildsDashboard onPartClick={handlePartClick} />
            </TabsContent>

            <TabsContent value="locations" className="mt-4">
              <InventoryLocations onPartClick={handlePartClick} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {selectedPartId && (
        <EditPartDrawer
          partId={selectedPartId}
          onClose={() => setSelectedPartId(null)}
        />
      )}
    </>
  );
}