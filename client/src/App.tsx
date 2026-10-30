import { type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Reports from './pages/Reports';
import Tasks from './pages/Tasks';
import KanbanBoard from './components/KanbanBoard';
import Dashboard from './components/Dashboard';
import UserManagement from './pages/UserManagement';
import ProjectManagement from './pages/ProjectManagement';

function Protected({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-center text-slate-500">Đang tải…</div>;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/kanban" element={<KanbanBoard/>} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/urgent" element={<Tasks urgentOnly />} />
        <Route path="/projects" element={<ProjectManagement />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/users" element={<AdminOnly><UserManagement /></AdminOnly>} />
        
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
