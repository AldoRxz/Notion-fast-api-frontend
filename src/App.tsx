import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import { useAuth } from './hooks/useAuth';

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function Dashboard() {
  const { logout } = useAuth();
  return (
    <div style={{ padding: 24 }}>
      <h2>Dashboard (placeholder)</h2>
      <p>Contenido privado. Implementar editor después.</p>
      <button onClick={logout} style={{ marginTop: 12 }}>Cerrar sesión</button>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
