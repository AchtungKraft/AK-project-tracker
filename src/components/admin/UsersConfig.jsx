import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function UsersConfig() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const userList = await base44.entities.User.list();
      return userList.sort((a, b) => a.full_name?.localeCompare(b.full_name));
    },
  });

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('ID copied to clipboard');
  };

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30">
        <CardTitle className="text-white">Users</CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          View all user accounts and their unique IDs. Copy the User ID to link with Team Members.
        </p>
      </CardHeader>
      <CardContent className="p-6">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No users found.
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white">
                      {user.full_name || 'No Name'}
                    </h3>
                    <span className="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-400 border border-blue-500 rounded">
                      {user.role || 'user'}
                    </span>
                  </div>
                  <div className="flex gap-3 text-sm text-gray-500 mt-1">
                    <span>{user.email}</span>
                    {user.created_date && (
                      <span>Joined: {new Date(user.created_date).toLocaleDateString()}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-1 font-mono">
                    <span>User ID: {user.id}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyToClipboard(user.id)}
                      className="h-6 w-6 text-gray-400 hover:text-white"
                      title="Copy User ID"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}