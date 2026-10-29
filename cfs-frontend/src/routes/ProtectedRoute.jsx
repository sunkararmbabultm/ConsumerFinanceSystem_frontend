import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function ProtectedRoute({ role }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  const isInternalUser = ["ADMIN", "LOAN_OFFICER", "CREDIT_ANALYST", "CREDIT_MANAGER"].includes(user.role);
  if (role === "ADMIN" && !isInternalUser) return <Navigate to="/customer" replace />;
  if (role === "CUSTOMER" && user.role !== "CUSTOMER") return <Navigate to="/admin" replace />;
  return <Outlet />;
}