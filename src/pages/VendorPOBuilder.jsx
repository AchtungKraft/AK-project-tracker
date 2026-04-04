import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import VendorSelector from "@/components/supply/VendorSelector";
import VendorPOBuilderPanel from "@/components/supply/VendorPOBuilder";

/**
 * VendorPOBuilder Page — Vendor-first PO creation workflow.
 * Step 1: Select a vendor
 * Step 2: Build PO cart from available parts
 */
export default function VendorPOBuilder() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const preselectedVendorId = urlParams.get('vendor_id');

  const [selectedVendor, setSelectedVendor] = useState(null);
  const [step, setStep] = useState(preselectedVendorId ? 'loading' : 'select');

  // Handle preselected vendor from URL
  useEffect(() => {
    if (preselectedVendorId && step === 'loading') {
      (async () => {
        const { base44 } = await import("@/api/base44Client");
        const vendors = await base44.entities.Vendor.filter({ id: preselectedVendorId });
        if (vendors.length > 0) {
          setSelectedVendor(vendors[0]);
          setStep('build');
        } else {
          setStep('select');
        }
      })();
    }
  }, [preselectedVendorId, step]);

  const handleSelectVendor = (vendor) => {
    setSelectedVendor(vendor);
    setStep('build');
  };

  const handleBack = () => {
    setSelectedVendor(null);
    setStep('select');
  };

  const handleSuccess = () => {
    navigate(createPageUrl('GlobalNeedToOrder'));
  };

  return (
    <MobileSafeAreaContainer>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black p-3 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(createPageUrl('GlobalNeedToOrder'))}
                className="text-gray-400 hover:text-white gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
                  <ShoppingCart className="w-7 h-7 text-green-400" />
                  VENDOR PO BUILDER
                </h1>
                <p className="text-sm text-gray-400">
                  {step === 'select'
                    ? 'Select a vendor to start building a purchase order'
                    : `Building PO for ${selectedVendor?.vendor_name || ''}`
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          {step === 'loading' && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-red-500 rounded-full animate-spin" />
            </div>
          )}

          {step === 'select' && (
            <VendorSelector onSelectVendor={handleSelectVendor} />
          )}

          {step === 'build' && selectedVendor && (
            <VendorPOBuilderPanel
              vendor={selectedVendor}
              onBack={handleBack}
              onSuccess={handleSuccess}
            />
          )}
        </div>
      </div>
    </MobileSafeAreaContainer>
  );
}