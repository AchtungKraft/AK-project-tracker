import AdminConfig from './pages/AdminConfig';
import ClientFeedbackDetail from './pages/ClientFeedbackDetail';
import ClientFeedbackRequestDetail from './pages/ClientFeedbackRequestDetail';
import ClientProjectPortal from './pages/ClientProjectPortal';
import ClientProjects from './pages/ClientProjects';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import MyPriorities from './pages/MyPriorities';
import MyProjects from './pages/MyProjects';
import MyTasks from './pages/MyTasks';
import PartsTracker from './pages/PartsTracker';
import PriorityDashboard from './pages/PriorityDashboard';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import Reports from './pages/Reports';
import Tasks from './pages/Tasks';
import TasksExplorer from './pages/TasksExplorer';
import TechSpecs from './pages/TechSpecs';
import ClientPortalAdmin from './pages/ClientPortalAdmin';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminConfig": AdminConfig,
    "ClientFeedbackDetail": ClientFeedbackDetail,
    "ClientFeedbackRequestDetail": ClientFeedbackRequestDetail,
    "ClientProjectPortal": ClientProjectPortal,
    "ClientProjects": ClientProjects,
    "Dashboard": Dashboard,
    "Home": Home,
    "MyPriorities": MyPriorities,
    "MyProjects": MyProjects,
    "MyTasks": MyTasks,
    "PartsTracker": PartsTracker,
    "PriorityDashboard": PriorityDashboard,
    "ProjectDetail": ProjectDetail,
    "Projects": Projects,
    "Reports": Reports,
    "Tasks": Tasks,
    "TasksExplorer": TasksExplorer,
    "TechSpecs": TechSpecs,
    "ClientPortalAdmin": ClientPortalAdmin,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};