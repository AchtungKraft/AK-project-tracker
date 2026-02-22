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
  Flame,
  ListChecks,
  X,
  AlertTriangle,
  Truck,
  Layers,
  Receipt,
} from "lucide-react";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import MobileSafeAreaContainer from "@/components/mobile/MobileSafeAreaContainer";
import MobileCollapsibleHeader from "@/components/mobile/MobileCollapsibleHeader";
import ActionAuditPanel from "@/components/dev/ActionAuditPanel";
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
      { divider: true },
      {
        title: "Supply Dashboard",
        url: createPageUrl("SupplyLanding"),
        icon: Layers,
      },
      {
        title: "Order Queue",
        url: createPageUrl("GlobalNeedToOrder"),
        icon: Truck,
      },
      {
        title: "PO Receiving",
        url: createPageUrl("POReceiving"),
        icon: Package,
      },
      {
        title: "Work Queues",
        url: createPageUrl("SupplyQueues"),
        icon: ListChecks,
      },
      { divider: true },
      {
        title: "Parts Tracker",
        url: createPageUrl("PartsTracker"),
        icon: Package,
      },
      {
        title: "Action Workbench",
        url: createPageUrl("PartsActionWorkbench"),
        icon: Flame,
      },
      {
        title: "Stock Reorder",
        url: createPageUrl("StockReorder"),
        icon: Package,
      },
      {
        title: "Financial Exceptions",
        url: createPageUrl("FinancialExceptionDashboard"),
        icon: AlertTriangle,
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
      {
        title: "Wiring Audit",
        url: createPageUrl("WiringAuditDashboard"),
        icon: Settings,
      },
      {
        title: "Data Normalization",
        url: createPageUrl("SupplyNormalization"),
        icon: Settings,
      },
      {
        title: "Portal Stats",
        url: createPageUrl("PortalStatsEmbed"),
        icon: BarChart3,
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

// Mobile bottom nav with safe area support
const MobileBottomNav = ({ currentPath, isAchtungKraft, onMenuOpen }) => {
  const mobileItems = isAchtungKraft ? [
    { title: "Home", url: createPageUrl("Dashboard"), icon: LayoutDashboard },
    { title: "Priorities", url: createPageUrl("PriorityDashboard"), icon: Flame },
    { title: "Clients", url: createPageUrl("ClientPortalHub"), icon: Building2 },
    { title: "Parts", url: createPageUrl("PartsTracker"), icon: Package },
    { title: "More", icon: Menu, isMenu: true },
  ] : [
    { title: "Projects", url: createPageUrl("MyProjects"), icon: FolderKanban },
    { title: "Priorities", url: createPageUrl("MyPriorities"), icon: Flame },
  ];

  return (
    <div 
      className="md:hidden fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-red-900/30 z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex justify-around items-center h-14 px-2">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive = !item.isMenu && currentPath === item.url;
          
          if (item.isMenu) {
            return (
              <button
                key={item.title}
                onClick={onMenuOpen}
                className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors text-gray-400 active:text-red-500"
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.title}</span>
              </button>
            );
          }
          
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

// Mobile off-canvas menu for secondary navigation
const MobileOffCanvasMenu = ({ isOpen, onClose, navigationItems, currentPath }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
        onClick={onClose}
      />
      
      {/* Menu Panel */}
      <div 
        className="fixed right-0 top-0 bottom-0 w-72 bg-gray-900 border-l border-red-900/30 z-[70] overflow-y-auto"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-red-900/30">
          <span className="text-white font-semibold">Menu</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <nav className="p-3 space-y-1">
          {navigationItems.filter(item => !item.divider).map((item) => {
            const Icon = item.icon;
            const isActive = !item.external && currentPath === item.url;
            
            if (item.external) {
              return (
                <a
                  key={item.title}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-gray-300 hover:bg-red-950/30 hover:text-white transition-colors"
                  onClick={onClose}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.title}</span>
                </a>
              );
            }
            
            return (
              <Link
                key={item.title}
                to={item.url}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                  isActive 
                    ? "bg-red-600 text-white" 
                    : "text-gray-300 hover:bg-red-950/30 hover:text-white"
                )}
                onClick={onClose}
              >
                <Icon className="w-5 h-5" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <style>{`
          :root {
            --background: 0 0% 7%;
            --foreground: 0 0% 98%;
            --card: 0 0% 10%;
            --card-foreground: 0 0% 98%;
            --popover: 0 0% 10%;
            --popover-foreground: 0 0% 98%;
            --primary: 0 84% 60%;
            --primary-foreground: 0 0% 100%;
            --secondary: 0 0% 20%;
            --secondary-foreground: 0 0% 98%;
            --muted: 0 0% 18%;
            --muted-foreground: 0 0% 65%;
            --accent: 0 0% 20%;
            --accent-foreground: 0 0% 98%;
            --destructive: 0 84% 60%;
            --destructive-foreground: 0 0% 100%;
            --border: 0 0% 20%;
            --input: 0 0% 20%;
            --ring: 0 84% 60%;
          }
          
          /* Global dark theme contrast fixes */
          body {
            color: hsl(var(--foreground));
            background: hsl(var(--background));
          }
          
          /* Links - ensure visibility */
          a:not([class]) {
            color: #60a5fa;
          }
          a:not([class]):hover {
            color: #93c5fd;
          }
          
          /* Ensure text readability */
          .text-muted-foreground {
            color: hsl(0 0% 65%) !important;
          }
          
          /* Ghost button visibility fix */
          [data-variant="ghost"], .ghost {
            color: hsl(0 0% 85%);
          }
          [data-variant="ghost"]:hover, .ghost:hover {
            background: hsl(0 0% 20%);
            color: hsl(0 0% 98%);
          }
          
          /* Outline button visibility fix */
          [data-variant="outline"] {
            border-color: hsl(0 0% 30%);
            color: hsl(0 0% 90%);
          }
          [data-variant="outline"]:hover {
            background: hsl(0 0% 20%);
            color: hsl(0 0% 100%);
          }
          
          /* Disabled state - still readable */
          button:disabled, [disabled] {
            opacity: 0.5;
            color: hsl(0 0% 60%);
          }
          
          /* Focus rings */
          *:focus-visible {
            outline: 2px solid hsl(0 84% 60%);
            outline-offset: 2px;
          }
          
          /* Table headers */
          th {
            color: hsl(0 0% 70%);
          }
          
          /* Dropdown/Select items */
          [role="option"], [role="menuitem"] {
            color: hsl(0 0% 90%);
          }
          [role="option"]:hover, [role="menuitem"]:hover,
          [role="option"]:focus, [role="menuitem"]:focus {
            background: hsl(0 0% 25%);
            color: hsl(0 0% 100%);
          }
          
          /* Mobile safe area support */
          @supports (padding-bottom: env(safe-area-inset-bottom)) {
            .mobile-safe-bottom {
              padding-bottom: calc(72px + env(safe-area-inset-bottom));
            }
          }
        `}</style>
        
        {/* Collapsible Mobile Header */}
        <MobileCollapsibleHeader
          logo={
            <img 
              src="https://achtungkraft.com/cdn/shop/files/AchtungLogoSticker_39633eb9-a276-4e81-8376-b8fef51b08d6.png"
              alt="Ächtung Kraft"
              className="h-7"
            />
          }
          title="ÄCHTUNG KRAFT"
          tagline="Built. Not Bought."
        />

        {/* Main Content with Safe Area */}
        <MobileSafeAreaContainer>
          <main className="px-3 py-3 flex-1">
            {children}
          </main>
        </MobileSafeAreaContainer>

        {/* Bottom Navigation */}
        <MobileBottomNav 
          currentPath={location.pathname} 
          isAchtungKraft={isAchtungKraft}
          onMenuOpen={() => setMobileMenuOpen(true)}
        />
        
        {/* Off-Canvas Menu */}
        <MobileOffCanvasMenu
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          navigationItems={navigationItems}
          currentPath={location.pathname}
        />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <style>{`
        :root {
          --background: 0 0% 7%;
          --foreground: 0 0% 98%;
          --card: 0 0% 10%;
          --card-foreground: 0 0% 98%;
          --popover: 0 0% 10%;
          --popover-foreground: 0 0% 98%;
          --primary: 0 84% 60%;
          --primary-foreground: 0 0% 100%;
          --secondary: 0 0% 20%;
          --secondary-foreground: 0 0% 98%;
          --muted: 0 0% 18%;
          --muted-foreground: 0 0% 65%;
          --accent: 0 0% 20%;
          --accent-foreground: 0 0% 98%;
          --destructive: 0 84% 60%;
          --destructive-foreground: 0 0% 100%;
          --border: 0 0% 20%;
          --input: 0 0% 20%;
          --ring: 0 84% 60%;
        }
        
        body {
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          color: hsl(var(--foreground));
        }
        
        /* Links - ensure visibility */
        a:not([class]) {
          color: #60a5fa;
        }
        a:not([class]):hover {
          color: #93c5fd;
        }
        
        /* Ensure text readability */
        .text-muted-foreground {
          color: hsl(0 0% 65%) !important;
        }
        
        /* Ghost button visibility fix */
        [data-variant="ghost"], .ghost {
          color: hsl(0 0% 85%);
        }
        [data-variant="ghost"]:hover, .ghost:hover {
          background: hsl(0 0% 20%);
          color: hsl(0 0% 98%);
        }
        
        /* Outline button visibility fix */
        [data-variant="outline"] {
          border-color: hsl(0 0% 30%);
          color: hsl(0 0% 90%);
        }
        [data-variant="outline"]:hover {
          background: hsl(0 0% 20%);
          color: hsl(0 0% 100%);
        }
        
        /* Disabled state - still readable */
        button:disabled, [disabled] {
          opacity: 0.5;
          color: hsl(0 0% 60%);
        }
        
        /* Focus rings */
        *:focus-visible {
          outline: 2px solid hsl(0 84% 60%);
          outline-offset: 2px;
        }
        
        /* Table headers */
        th {
          color: hsl(0 0% 70%);
        }
        
        /* Dropdown/Select items */
        [role="option"], [role="menuitem"] {
          color: hsl(0 0% 90%);
        }
        [role="option"]:hover, [role="menuitem"]:hover,
        [role="option"]:focus, [role="menuitem"]:focus {
          background: hsl(0 0% 25%);
          color: hsl(0 0% 100%);
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
    !item.external && location.pathname === item.url && "bg-red-600 text-white"
  )}
>
  {item.external ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-2 py-1.5"
    >
      <item.icon className="w-4 h-4" />
      <span className="font-medium text-sm">{item.title}</span>
    </a>
  ) : (
    <Link to={item.url} className="flex items-center gap-2 px-2 py-1.5">
      <item.icon className="w-4 h-4" />
      <span className="font-medium text-sm">{item.title}</span>
    </Link>
  )}
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

          {/* Admin-only Action Audit Panel */}
          <ActionAuditPanel />
          </div>
          </SidebarProvider>
          );
          }