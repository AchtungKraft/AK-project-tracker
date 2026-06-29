import React, { useMemo } from "react";
import { Wrench } from "lucide-react";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function VendorServiceHistory({ commitments, serviceMap }) {
  const serviceStats = useMemo(() => {
    const map = new Map();
    for (const sc of commitments) {
      if (!sc.service_id) continue;
      const key = sc.service_id;
      if (!map.has(key)) {
        const svc = serviceMap.get(key);
        map.set(key, {
          serviceId: key,
          serviceName: svc?.name || "Unknown Service",
          count: 0,
          lastUsed: null,
        });
      }
      const entry = map.get(key);
      entry.count++;
      const d = sc.completed_date || sc.ordered_date || sc.created_date;
      if (d && (!entry.lastUsed || d > entry.lastUsed)) entry.lastUsed = d;
    }
    return [...map.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.lastUsed && b.lastUsed) return b.lastUsed.localeCompare(a.lastUsed);
      return 0;
    });
  }, [commitments, serviceMap]);

  if (serviceStats.length === 0) return null;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Wrench className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Service History</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-700/50">
            <th className="text-left py-1 font-medium">Service</th>
            <th className="text-right py-1 font-medium w-14">Count</th>
            <th className="text-right py-1 font-medium w-24">Last Used</th>
          </tr>
        </thead>
        <tbody>
          {serviceStats.map(s => (
            <tr key={s.serviceId} className="border-b border-gray-800/50 last:border-0">
              <td className="py-1.5 text-white">{s.serviceName}</td>
              <td className="py-1.5 text-right text-gray-300 font-medium">{s.count}</td>
              <td className="py-1.5 text-right text-gray-500">{formatDate(s.lastUsed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}