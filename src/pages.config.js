import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import MyTasks from './pages/MyTasks';
import Reports from './pages/Reports';
import AdminConfig from './pages/AdminConfig';
import Tasks from './pages/Tasks';
import Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Projects": Projects,
    "ProjectDetail": ProjectDetail,
    "MyTasks": MyTasks,
    "Reports": Reports,
    "AdminConfig": AdminConfig,
    "Tasks": Tasks,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: Layout,
};