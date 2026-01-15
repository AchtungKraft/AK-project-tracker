import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { 
  LayoutDashboard, 
  FolderKanban, 
  Settings, 
  BarChart3,
  Menu,
  Plus,
  Package,
  Flame
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";

const getNavigationItems = (isAchtungKraft) => {
  if (isAchtungKraft) {
    return [
      {
        title: "Projects",
        url: createPageUrl("Dashboard"),
        icon: FolderKanban,
      },
      {
        title: "Team Priorities",
        url: createPageUrl("PriorityDashboard"),
        icon: Flame,
      },
      {
        title: "Client Portal",
        url: createPageUrl("ClientPortalHub"),
        icon: Building2,
      },
      {
        title: "Parts Tracker",
        url: createPageUrl("PartsTracker"),
        icon: Package,
      },
      { divider: true },
      {
        title: "Admin Config",
        url: createPageUrl("AdminConfig"),
        icon: Settings,
      },
      {
        title: "Tech Specs",
        url: createPageUrl("TechSpecs"),
        icon: Settings,
      },
    ];
  } else {
    return [
      {
        title: "My Projects",
        url: createPageUrl("MyProjects"),
        icon: FolderKanban,
      },
      {
        title: "My Priorities",
        url: createPageUrl("MyPriorities"),
        icon: Flame,
      },
    ];
  }
};

// Mobile bottom nav
const MobileBottomNav = ({ currentPath, isAchtungKraft }) => {
  const mobileItems = isAchtungKraft ? [
    { title: "Home", url: createPageUrl("Dashboard"), icon: LayoutDashboard },
    { title: "Priorities", url: createPageUrl("PriorityDashboard"), icon: Flame },
    { title: "Tasks", url: createPageUrl("TasksExplorer"), icon: ListChecks },
    { title: "Clients", url: createPageUrl("ClientPortalHub"), icon: Building2 },
    { title: "Parts", url: createPageUrl("PartsTracker"), icon: Package },
  ] : [
    { title: "Projects", url: createPageUrl("MyProjects"), icon: FolderKanban },
    { title: "Priorities", url: createPageUrl("MyPriorities"), icon: Flame },
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
  // Hide layout for client portal pages (no auth required)
  const isClientPortalPage = ['ClientProjects', 'ClientProjectPortal', 'ClientFeedbackRequestDetail'].includes(currentPageName);
  
  if (isClientPortalPage) {
    return <>{children}</>;
  }
  
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [teamMember, setTeamMember] = useState(null);
  const [allTeamMembers, setAllTeamMembers] = useState([]);
  const [viewAsCompany, setViewAsCompany] = useState(() => {
    return localStorage.getItem('achtung_view_as_company') || null;
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchUserAndTeamMember = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        
        const teamMembers = await base44.entities.TeamMember.list();
        setAllTeamMembers(teamMembers);
        const userTeamMember = teamMembers.find(tm => tm.user_id === currentUser.id);
        setTeamMember(userTeamMember);
        
        // Redirect company users to My Projects if they try to access unauthorized pages
        // If Achtung Kraft member is viewing as a company, also apply restrictions
        const isViewingAsCompany = userTeamMember?.is_achtung_kraft_member && viewAsCompany;
        if ((userTeamMember && !userTeamMember.is_achtung_kraft_member) || isViewingAsCompany) {
          const allowedPaths = [
            createPageUrl("MyProjects"),
            createPageUrl("MyPriorities"),
            createPageUrl("ProjectDetail")
          ];
          const currentPath = location.pathname;
          const isAllowed = allowedPaths.some(path => currentPath.startsWith(path));
          
          if (!isAllowed) {
            window.location.href = createPageUrl("MyProjects");
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    };
    fetchUserAndTeamMember();
  }, [location.pathname, viewAsCompany]);

  const handleViewAsChange = (company) => {
    if (company === 'achtung_kraft') {
      setViewAsCompany(null);
      localStorage.removeItem('achtung_view_as_company');
      window.location.href = createPageUrl("Dashboard");
    } else {
      setViewAsCompany(company);
      localStorage.setItem('achtung_view_as_company', company);
      window.location.href = createPageUrl("MyProjects");
    }
  };

  // Determine effective access level
  const isAchtungKraftMember = teamMember?.is_achtung_kraft_member ?? true;
  const isAchtungKraft = isAchtungKraftMember && !viewAsCompany;
  const navigationItems = getNavigationItems(isAchtungKraft);

  // Get unique company names for the dropdown
  const companies = [...new Set(allTeamMembers.filter(tm => tm.company).map(tm => tm.company))].sort();

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

        <MobileBottomNav currentPath={location.pathname} isAchtungKraft={isAchtungKraft} />
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
                    {navigationItems.map((item, index) => (
                      item.divider ? (
                        <div key={`divider-${index}`} className="my-2 border-t border-gray-700/50" />
                      ) : (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton 
                            asChild 
                            className={cn(
                                                              "hover:bg-red-950/30 hover:text-red-400 transition-colors duration-200 rounded-lg mb-0.5",
                                                              location.pathname === item.url && "bg-red-600 text-white"
                                                            )}
                          >
                            <Link to={item.url} className="flex items-center gap-2 px-2 py-1.5">
                              <item.icon className="w-4 h-4" />
                              <span className="font-medium text-sm">{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    ))}
                  </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-red-900/30 p-3 space-y-3">
            {/* View As Selector for Achtung Kraft Members */}
            {isAchtungKraftMember && companies.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400 uppercase tracking-wide">View As</label>
                <Select 
                  value={viewAsCompany || 'achtung_kraft'} 
                  onValueChange={handleViewAsChange}
                >
                  <SelectTrigger className="w-full bg-gray-900/50 border-gray-700 text-white h-9">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="achtung_kraft">
                      <span className="font-semibold text-red-400">⚡ Achtung Kraft (Full Access)</span>
                    </SelectItem>
                    {companies.map(company => (
                      <SelectItem key={company} value={company}>
                        🏢 {company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* User Info */}
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
                  {viewAsCompany ? `Viewing as: ${viewAsCompany}` : (user?.team_role || user?.role || 'Team Member')}
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