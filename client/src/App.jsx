import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/home'; 
import SystemHealth from './pages/SystemHealth';
import Contact from './pages/Contact';
import Login from './pages/Login';
import ForgotKey from './pages/ForgotKey';
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import SystemError from "./pages/SystemError";
import AIInnovation from './pages/AIInnovation';
import Settings from './pages/Settings';
import Users from './pages/Users';
import AIChatPopup from './components/AIChatPopup';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import VPatrol from './pages/VPatrol';
import Cameras from './pages/Cameras';
import DriverPass from './pages/DriverPass';
import TenantLogistics from './pages/TenantLogistics';
import DriverPortal from './pages/DriverPortal';
import StaffManagement from './pages/StaffManagement';
import UserLogs from './pages/UserLogs';
import TenantManagement from './pages/TenantManagement';
import FaceEnrollment from './pages/FaceEnrollment';
import Attendance from './pages/Attendance';
import GateScanner from './pages/GateScanner';
import ObjectDetection from './pages/ObjectDetection';
import SecurityReview from './pages/SecurityReview';
import IncidentDashboard from './pages/IncidentDashboard';
import { ACCESS } from './constants/roles';
import './App.css';

function App() {
  const location = useLocation();
  // Public driver pass is a standalone ticket view — no internal floating assistant.
  const hideFloatingWidgets = location.pathname.startsWith('/driver-pass');

  return (
    <div className="App bg-[#0f172a] min-h-screen text-slate-200 selection:bg-blue-500/30">
      <ErrorBoundary>
      <Routes>
        {/* --- Public Routes --- */}
        <Route path="/" element={<Home />} />
        <Route path="/system-health" element={<SystemHealth />} />
        <Route path="/driver-pass/:ref" element={<DriverPass />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotKey />} />
        <Route path="/innovation" element={<AIInnovation />} />
        <Route path="/driver-portal" element={<DriverPortal />} />

        {/* --- Authenticated (any role) --- */}
        {/* Dashboard adapts its content by role; everyone enrols their own face. */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/enrollment" element={
          <ProtectedRoute>
            <FaceEnrollment />
          </ProtectedRoute>
        } />

        {/* --- Live monitoring / AI & security — FM only --- */}
        <Route path="/cameras" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <Cameras />
          </ProtectedRoute>
        } />
        <Route path="/object-detection" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <ObjectDetection />
          </ProtectedRoute>
        } />
        <Route path="/vpatrol" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <VPatrol />
          </ProtectedRoute>
        } />
        <Route path="/gate-scanner" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <GateScanner />
          </ProtectedRoute>
        } />

        {/* Attendance: FM (all) + Tenant (own staff) + Staff (own records — scoped server-side) */}
        <Route path="/attendance" element={
          <ProtectedRoute allowedRoles={ACCESS.ANY}>
            <Attendance />
          </ProtectedRoute>
        } />

        {/* --- FM + Tenant (own staff, own logistics) --- */}
        <Route path="/staff" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_TENANT}>
            <StaffManagement />
          </ProtectedRoute>
        } />
        {/* Logistics: FM + Tenant can book; Staff gets operational view + status updates. */}
        <Route path="/logistics" element={
          <ProtectedRoute allowedRoles={ACCESS.ANY}>
            <TenantLogistics />
          </ProtectedRoute>
        } />

        {/* --- FM only (administration, security review, system settings) --- */}
        <Route path="/users" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <Users />
          </ProtectedRoute>
        } />
        <Route path="/security-review" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <SecurityReview />
          </ProtectedRoute>
        } />
        <Route path="/incidents" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <IncidentDashboard />
          </ProtectedRoute>
        } />
        <Route path="/tenant-management" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_ONLY}>
            <TenantManagement />
          </ProtectedRoute>
        } />
        {/* FM (any staff) + Tenant (own staff only — enforced server-side) */}
        <Route path="/user-logs/:id" element={
          <ProtectedRoute allowedRoles={ACCESS.FM_TENANT}>
            <UserLogs />
          </ProtectedRoute>
        } />
        {/* Settings: any authenticated user (content inside is role-gated) */}
        <Route path="/settings" element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } />
        
        {/* --- System Error Pages --- */}
        <Route path="/error/400" element={
          <SystemError 
            code="400" 
            title="Invalid Data Payload" 
            message="The monitoring sector received a malformed request. Please check your sensor inputs and try again."
            returnPath="/dashboard"
            returnText="Return to Command Center"
          />
        } />
        <Route path="/error/401" element={
          <SystemError 
            code="401" 
            title="Authentication Required" 
            message="Your FlowGuard session has expired or your access key is invalid. Please authenticate to view this dashboard."
            returnPath="/login"
            returnText="Return to Login"
          />
        } />
        <Route path="/error/403" element={
          <SystemError 
            code="403" 
            title="Clearance Denied" 
            message="You do not have the required administrative clearance to access this sector of the Harrison Food Factory."
            returnPath="/dashboard"
            returnText="Back to Permitted Zones"
          />
        } />
        <Route path="/error/500" element={
          <SystemError 
            code="500" 
            title="Database Synchronization Failure" 
            message="FlowGuard core servers are currently unreachable. Our automated AI systems are attempting to restore the connection."
            returnPath="/dashboard"
            returnText="Retry Connection"
          />
        } />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
      </ErrorBoundary>

      {!hideFloatingWidgets && <AIChatPopup />}
    </div>
  );
}

export default App;
