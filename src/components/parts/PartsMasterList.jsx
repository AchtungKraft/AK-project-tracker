import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Package, Filter, LayoutGrid, List } from "lucide-react";
import UnifiedAddPartModal from "./UnifiedAddPartModal";
import EditPartDrawer from "./EditPartDrawer";
import ImageModal from "../ui/ImageModal";

const FILTER_STORAGE_KEY = 'achtung_parts_master_filters';

const getCategoryPath = (categoryId, categories) => {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;
  
  if (category.parent_id) {
    const parent = categories.find(c => c.id === category.parent_id);
    if (parent) {
      return `${parent.name} > ${category.name}`;
    }
  }
  return category.name;
};

import PartsExplorerLayout from "./PartsExplorerLayout";

export default function PartsMasterList({ onPartClick }) {
  return <PartsExplorerLayout onPartClick={onPartClick} />;
}