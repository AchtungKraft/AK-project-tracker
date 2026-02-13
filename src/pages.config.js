/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminConfig from './pages/AdminConfig';
import ClientFeedbackDetail from './pages/ClientFeedbackDetail';
import ClientFeedbackRequestDetail from './pages/ClientFeedbackRequestDetail';
import ClientPortalAdmin from './pages/ClientPortalAdmin';
import ClientPortalHub from './pages/ClientPortalHub';
import ClientProjectPortal from './pages/ClientProjectPortal';
import ClientProjects from './pages/ClientProjects';
import Dashboard from './pages/Dashboard';
import FinancialExceptionDashboard from './pages/FinancialExceptionDashboard';
import Home from './pages/Home';
import InventoryMutationMonitor from './pages/InventoryMutationMonitor';
import MyPriorities from './pages/MyPriorities';
import MyProjects from './pages/MyProjects';
import MyTasks from './pages/MyTasks';
import PartsActionWorkbench from './pages/PartsActionWorkbench';
import PartsLifecycleDiagnostic from './pages/PartsLifecycleDiagnostic';
import PartsTracker from './pages/PartsTracker';
import PriorityDashboard from './pages/PriorityDashboard';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import Reports from './pages/Reports';
import Tasks from './pages/Tasks';
import TasksExplorer from './pages/TasksExplorer';
import TechSpecs from './pages/TechSpecs';
import PortalStatsEmbed from './pages/PortalStatsEmbed';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminConfig": AdminConfig,
    "ClientFeedbackDetail": ClientFeedbackDetail,
    "ClientFeedbackRequestDetail": ClientFeedbackRequestDetail,
    "ClientPortalAdmin": ClientPortalAdmin,
    "ClientPortalHub": ClientPortalHub,
    "ClientProjectPortal": ClientProjectPortal,
    "ClientProjects": ClientProjects,
    "Dashboard": Dashboard,
    "FinancialExceptionDashboard": FinancialExceptionDashboard,
    "Home": Home,
    "InventoryMutationMonitor": InventoryMutationMonitor,
    "MyPriorities": MyPriorities,
    "MyProjects": MyProjects,
    "MyTasks": MyTasks,
    "PartsActionWorkbench": PartsActionWorkbench,
    "PartsLifecycleDiagnostic": PartsLifecycleDiagnostic,
    "PartsTracker": PartsTracker,
    "PriorityDashboard": PriorityDashboard,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "Reports": Reports,
    "Tasks": Tasks,
    "TasksExplorer": TasksExplorer,
    "TechSpecs": TechSpecs,
    "PortalStatsEmbed": PortalStatsEmbed,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};