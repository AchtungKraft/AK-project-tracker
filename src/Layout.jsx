
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { 
  LayoutDashboard, 
  FolderKanban, 
  ListChecks, 
  Settings, 
  BarChart3,
  Menu,
  Plus
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
  },
  {
    title: "Projects",
    url: createPageUrl("Projects"),
    icon: FolderKanban,
  },
  {
    title: "My Tasks",
    url: createPageUrl("MyTasks"),
    icon: ListChecks,
  },
  {
    title: "Reports",
    url: createPageUrl("Reports"),
    icon: BarChart3,
  },
  {
    title: "Admin Config",
    url: createPageUrl("AdminConfig"),
    icon: Settings,
  },
];

// Mobile bottom nav
const MobileBottomNav = ({ currentPath }) => {
  const mobileItems = [
    { title: "Home", url: createPageUrl("Dashboard"), icon: LayoutDashboard },
    { title: "Tasks", url: createPageUrl("MyTasks"), icon: ListChecks },
    { title: "Projects", url: createPageUrl("Projects"), icon: FolderKanban },
    { title: "Reports", url: createPageUrl("Reports"), icon: BarChart3 },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-red-900/30 z-50">
      <div className="flex justify-around items-center h-14 px-2">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.url;
          return (
            <Link
              key={item.title}
              to={item.url}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors",
                isActive ? "text-red-500" : "text-gray-400"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black pb-14">
        <style>{`
          :root {
            --background: 0 0% 7%;
            --foreground: 0 0% 98%;
            --primary: 0 84% 60%;
            --primary-foreground: 0 0% 98%;
            --muted: 0 0% 15%;
            --accent: 0 84% 60%;
          }
        `}</style>
        
        {/* Mobile Header */}
        <header className="sticky top-0 bg-black/80 backdrop-blur-xl border-b border-red-900/30 px-3 py-2 z-40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img 
                src="https://achtungkraft.com/cdn/shop/files/AchtungLogoSticker_39633eb9-a276-4e81-8376-b8fef51b08d6.png"
                alt="Ächtung Kraft"
                className="h-7"
              />
              <div>
                <h1 className="text-xs font-bold text-white">ÄCHTUNG KRAFT</h1>
                <p className="text-xs text-gray-400">Built. Not Bought.</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-3 py-3">
          {children}
        </main>

        <MobileBottomNav currentPath={location.pathname} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <style>{`
        :root {
          --background: 0 0% 7%;
          --foreground: 0 0% 98%;
          --primary: 0 84% 60%;
          --primary-foreground: 0 0% 98%;
          --muted: 0 0% 15%;
            --accent: 0 84% 60%;
        }
        body {
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
        }
      `}</style>
      
      <div className="min-h-screen flex w-full bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <Sidebar className="border-r border-red-900/30 bg-black/40 backdrop-blur-xl">
          <SidebarHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center gap-2">
              <img 
                src="https://achtungkraft.com/cdn/shop/files/AchtungLogoSticker_39633eb9-a276-4e81-8376-b8fef51b08d6.png"
                alt="Ächtung Kraft"
                className="h-8"
              />
              <div>
                <h2 className="font-bold text-white text-base">ÄCHTUNG KRAFT</h2>
                <p className="text-xs text-gray-400">Built. Not Bought.</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-2">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-1">
                Navigation
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={cn(
                          "hover:bg-red-950/30 hover:text-red-400 transition-colors duration-200 rounded-lg mb-0.5",
                          location.pathname === item.url && "bg-red-950/40 text-red-400"
                        )}
                      >
                        <Link to={item.url} className="flex items-center gap-2 px-2 py-1.5">
                          <item.icon className="w-4 h-4" />
                          <span className="font-medium text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-red-900/30 p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-red-800 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">
                  {user?.full_name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white text-sm truncate">
                  {user?.full_name || 'User'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {user?.team_role || user?.role || 'Team Member'}
                </p>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col overflow-auto">
          <div className="flex-1">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
