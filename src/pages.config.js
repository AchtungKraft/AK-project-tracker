import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import MyTasks from './pages/MyTasks';
import Reports from './pages/Reports';
import AdminConfig from './pages/AdminConfig';
import PartsTracker from './pages/PartsTracker';
import PriorityDashboard from './pages/PriorityDashboard';
import TasksExplorer from './pages/TasksExplorer';
import MyProjects from './pages/MyProjects';
import MyPriorities from './pages/MyPriorities';
import ClientFeedbackDetail from './pages/ClientFeedbackDetail';
import ClientProjects from './pages/ClientProjects';
import ClientProjectPortal from './pages/ClientProjectPortal';
import ClientFeedbackRequestDetail from './pages/ClientFeedbackRequestDetail';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Projects": Projects,
    "ProjectDetail": ProjectDetail,
    "MyTasks": MyTasks,
    "Reports": Reports,
    "AdminConfig": AdminConfig,
    "PartsTracker": PartsTracker,
    "PriorityDashboard": PriorityDashboard,
    "TasksExplorer": TasksExplorer,
    "MyProjects": MyProjects,
    "MyPriorities": MyPriorities,
    "ClientFeedbackDetail": ClientFeedbackDetail,
    "ClientProjects": ClientProjects,
    "ClientProjectPortal": ClientProjectPortal,
    "ClientFeedbackRequestDetail": ClientFeedbackRequestDetail,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};