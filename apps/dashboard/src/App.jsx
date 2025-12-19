import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import AdminUsers from './pages/AdminUsers';
import Secrets from './pages/Secrets';
import CreateProject from './pages/CreateProject';
import DesignSession from './pages/DesignSession';
import SpecReview from './pages/SpecReview';
import BuildProgress from './pages/BuildProgress';
import VMs from './pages/VMs';
import Tickets from './pages/Tickets';
import KanbanBoard from './pages/KanbanBoard';
import AgentMonitor from './pages/AgentMonitor';
import AgentCatalog from './pages/AgentCatalog';
import LearningDashboard from './pages/LearningDashboard';
import AgentDetail from './pages/AgentDetail';
import SignIn from './pages/SignIn';
import './App.css';
import './layout.css';
import './agent-catalog.css';

function App() {

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/tickets" element={
            <ProtectedRoute>
              <Tickets />
            </ProtectedRoute>
          } />
          <Route path="/tickets/kanban" element={
            <ProtectedRoute>
              <KanbanBoard />
            </ProtectedRoute>
          } />
          <Route path="/vms" element={
            <ProtectedRoute>
              <VMs />
            </ProtectedRoute>
          } />
          <Route path="/agents/catalog" element={
            <ProtectedRoute>
              <AgentCatalog />
            </ProtectedRoute>
          } />
          <Route path="/agents" element={
            <ProtectedRoute>
          <Route path="/agents/catalog/:id" element={
            <ProtectedRoute>
              <AgentDetail />
            </ProtectedRoute>
          } />
              <AgentMonitor />
            </ProtectedRoute>
          } />
          <Route path="/projects/new" element={
            <ProtectedRoute>
              <CreateProject />
            </ProtectedRoute>
          } />
          <Route path="/design/:sessionId" element={
            <ProtectedRoute>
              <DesignSession />
            </ProtectedRoute>
          } />
          <Route path="/review/:sessionId" element={
            <ProtectedRoute>
              <SpecReview />
            </ProtectedRoute>
          } />
          <Route path="/build/:sessionId" element={
            <ProtectedRoute>
              <BuildProgress />
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute adminOnly>
              <AdminUsers />
            </ProtectedRoute>
          } />
          <Route path="/secrets" element={
            <ProtectedRoute adminOnly>
              <Secrets />
            </ProtectedRoute>
          } />
          <Route path="/learning" element={
            <ProtectedRoute>
              <LearningDashboard />
            </ProtectedRoute>
          } />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
