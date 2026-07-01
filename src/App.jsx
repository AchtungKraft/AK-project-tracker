import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PurchaseOrders from './pages/PurchaseOrders';
import ProjectPrintView from './pages/ProjectPrintView';
import PersonPrintView from './pages/PersonPrintView';
import BuildKnowledge from './pages/BuildKnowledge';
import ProcedurePage from './pages/ProcedurePage';
import ClientPage from './pages/ClientPage';
import MediaLibrary from './pages/MediaLibrary';
import ClientFeedbackRequestDetail from './pages/ClientFeedbackRequestDetail';
import ClientProjectPortal from './pages/ClientProjectPortal';
import ClientProjects from './pages/ClientProjects';
// VendorPOBuilder page removed — vendor PO creation is now inline in GlobalNeedToOrder

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path.toLowerCase()}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}


      <Route path="/buildknowledge" element={
        <LayoutWrapper currentPageName="BuildKnowledge">
          <BuildKnowledge />
        </LayoutWrapper>
      } />
      <Route path="/buildknowledge/procedure" element={
        <LayoutWrapper currentPageName="BuildKnowledge">
          <ProcedurePage />
        </LayoutWrapper>
      } />
      <Route path="/purchaseorders" element={
        <LayoutWrapper currentPageName="PurchaseOrders">
          <PurchaseOrders />
        </LayoutWrapper>
      } />
      <Route path="/medialibrary" element={
        <LayoutWrapper currentPageName="MediaLibrary">
          <MediaLibrary />
        </LayoutWrapper>
      } />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


// Public routes that clients access without login (token/slug auth)
const PublicClientRoutes = () => {
  return (
    <Routes>
      <Route path="/clientfeedbackrequestdetail" element={<ClientFeedbackRequestDetail />} />
      <Route path="/clientprojectportal" element={<ClientProjectPortal />} />
      <Route path="/clientprojects" element={<ClientProjects />} />
      <Route path="/clientpage" element={<ClientPage />} />
      <Route path="/projectprintview" element={<ProjectPrintView />} />
      <Route path="/personprintview" element={<PersonPrintView />} />
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
};

function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <PublicClientRoutes />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App