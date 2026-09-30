import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "../components/Layout.jsx";

import Login from "../pages/Login.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Residents from "../pages/Residents.jsx";
import ResidentProfile from "../pages/ResidentProfile.jsx";
import Certificates from "../pages/Certificates.jsx";
import Blotter from "../pages/Blotter.jsx";
import Announcements from "../pages/Announcements.jsx";
import Admin from "../pages/Admin.jsx";
import BackupDatabase from "../pages/BackupDatabase.jsx";
import TeamChat from "../pages/TeamChat.jsx";
import Profile from "../pages/Profile.jsx";

const isAuthenticated = () => localStorage.getItem("barangay199_auth") === "true";
const getUserRole = () => localStorage.getItem("barangay199_role") || "user";
const ALL_ROLES = ["superadmin", "admin", "user"];
const OFFICIAL_ROLES = ["superadmin", "admin"];

function ProtectedRoute({ children, allowedRoles = ALL_ROLES }) {
  const location = useLocation();
  const authenticated = isAuthenticated();
  const userRole = getUserRole();

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Navigate to={userRole === "user" ? "/announcements" : "/dashboard"} replace />;
  }

  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/profile" element={<Profile />} />
        <Route path="/team-chat" element={<ProtectedRoute allowedRoles={OFFICIAL_ROLES}><TeamChat /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={OFFICIAL_ROLES}><Dashboard /></ProtectedRoute>} />
        <Route path="/residents" element={<ProtectedRoute allowedRoles={OFFICIAL_ROLES}><Residents /></ProtectedRoute>} />
        <Route path="/residents/:id" element={<ProtectedRoute allowedRoles={OFFICIAL_ROLES}><ResidentProfile /></ProtectedRoute>} />
        <Route path="/certificates" element={<ProtectedRoute allowedRoles={OFFICIAL_ROLES}><Certificates /></ProtectedRoute>} />
        <Route path="/blotter" element={<ProtectedRoute allowedRoles={OFFICIAL_ROLES}><Blotter /></ProtectedRoute>} />
        <Route path="/announcements" element={<Announcements />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["superadmin"]}>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/database-backups"
          element={
            <ProtectedRoute allowedRoles={OFFICIAL_ROLES}>
              <BackupDatabase />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
