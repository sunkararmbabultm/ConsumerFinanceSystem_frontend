import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Bell, BriefcaseBusiness, ChevronDown, ChevronLeft,
  ChevronRight, CircleDollarSign, ClipboardCheck, CreditCard, FileClock,
  FileText, Gauge, Landmark, LogOut, Menu, Search, Settings, ShieldCheck,
  UserRound, Users, UserRoundPlus, Wallet, X,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import ThemeToggle from "../components/ThemeToggle";

const customerLinks = [
  { label: "Overview", path: "/customer", icon: Gauge, end: true },
  { label: "My profile", path: "/customer/profile", icon: UserRound },
  { label: "Apply for finance", path: "/customer/apply", icon: CircleDollarSign },
  { label: "Loan products", path: "/customer/loan-products", icon: Landmark },
  { label: "My applications", path: "/customer/applications", icon: FileText },
  { label: "Disbursement", path: "/customer/disbursement", icon: Wallet },
  { label: "EMI schedule", path: "/customer/emi", icon: CreditCard },
  { label: "Repayment history", path: "/customer/repayments", icon: Activity },
  { label: "Notifications", path: "/customer/notifications", icon: Bell },
  { label: "Settings", path: "/customer/settings", icon: Settings },
];

const adminLinks = [
  { label: "Overview", path: "/admin", icon: Gauge, end: true },
  { label: "Loan products", path: "/admin/loan-products", icon: Landmark },
  { label: "Applications", path: "/admin/applications", icon: FileText },
  { label: "Review queue", path: "/admin/review-queue", icon: ClipboardCheck },
  { label: "Customers", path: "/admin/customers", icon: Users },
  { label: "KYC review", path: "/admin/kyc", icon: ShieldCheck },
  { label: "Internal users", path: "/admin/users", icon: UserRoundPlus },
  { label: "Credit assessments", path: "/admin/assessments", icon: Activity },
  { label: "Approvals", path: "/admin/approvals", icon: ShieldCheck },
  { label: "Disbursements", path: "/admin/disbursements", icon: Wallet },
  { label: "EMI schedules", path: "/admin/emi", icon: CreditCard },
  { label: "Repayments", path: "/admin/repayments", icon: FileClock },
  { label: "Notifications", path: "/admin/notifications", icon: Bell },
  { label: "Settings", path: "/admin/settings", icon: Settings },
];

const roleLinks = {
  LOAN_OFFICER: [
    { label: "Overview", path: "/admin", icon: Gauge, end: true },
    { label: "Applications", path: "/admin/applications", icon: FileText },
    { label: "Review queue", path: "/admin/review-queue", icon: ClipboardCheck },
    { label: "EMI schedules", path: "/admin/emi", icon: CreditCard },
    { label: "Repayments", path: "/admin/repayments", icon: FileClock },
    { label: "Notifications", path: "/admin/notifications", icon: Bell },
  ],
  CREDIT_ANALYST: [
    { label: "Overview", path: "/admin", icon: Gauge, end: true },
    { label: "Applications", path: "/admin/applications", icon: FileText },
    { label: "Credit assessments", path: "/admin/assessments", icon: Activity },
    { label: "Notifications", path: "/admin/notifications", icon: Bell },
  ],
  CREDIT_MANAGER: [
    { label: "Overview", path: "/admin", icon: Gauge, end: true },
    { label: "Applications", path: "/admin/applications", icon: FileText },
    { label: "Credit assessments", path: "/admin/assessments", icon: Activity },
    { label: "Decision queue", path: "/admin/decisions", icon: ShieldCheck },
    { label: "Approvals", path: "/admin/approvals", icon: ClipboardCheck },
    { label: "Notifications", path: "/admin/notifications", icon: Bell },
  ],
};

function getPageTitle(pathname, links) {
  return links.find((link) => link.path === pathname)?.label || "Finance workspace";
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const isAdmin = user?.role !== "CUSTOMER";
  const workspaceBase = isAdmin ? "/admin" : "/customer";
  const links = isAdmin
    ? user?.role === "ADMIN" ? adminLinks : roleLinks[user?.role] || roleLinks.LOAN_OFFICER
    : customerLinks;
  const title = getPageTitle(location.pathname, links);

  function exit() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {drawerOpen && <button className="drawer-scrim" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar ${drawerOpen ? "drawer-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark"><Landmark size={19} /></span>
          {!collapsed && <span className="brand-name">Northline<small>FINANCIAL</small></span>}
          <button className="icon-button sidebar-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-label">{isAdmin ? "ADMINISTRATION" : "YOUR FINANCES"}</div>
        <nav className="side-nav" aria-label="Main navigation">
          {links.map(({ label, path, icon: Icon, end }) => (
            <NavLink key={path} to={path} end={end} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={() => setDrawerOpen(false)} title={collapsed ? label : undefined}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-note"><span className="help-icon"><BriefcaseBusiness size={17} /></span>{!collapsed && <span>Need a hand?<small>Contact support</small></span>}</div>
          <button className="nav-link logout-link" onClick={exit}><LogOut size={18} /><span>Sign out</span></button>
          <button className="collapse-control" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse menu</span></>}
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div className="breadcrumbs"><span>{isAdmin ? "Administration" : "My account"}</span><ChevronRight size={14} /><strong>{title}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="top-search"><Search size={16} /><input aria-label="Search" placeholder="Search" /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" onClick={() => navigate(`${workspaceBase}/notifications`)} aria-label="Notifications"><Bell size={18} /><span className="unread-dot" /></button>
            <ThemeToggle />
            <div className="profile-menu-wrap">
              <button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
                <span className="avatar">{(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}</span>
                <span className="profile-label"><strong>{user?.name || "Account"}</strong><small>{isAdmin ? user.role.replaceAll("_", " ") : "Customer"}</small></span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && <div className="profile-dropdown"><span className="dropdown-email">{user?.email}</span><button onClick={() => navigate(`${workspaceBase}/${isAdmin ? "settings" : "profile"}`)}><UserRound size={16} /> {isAdmin ? "Workspace settings" : "My profile"}</button><button onClick={exit}><LogOut size={16} /> Sign out</button></div>}
            </div>
          </div>
        </header>
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  );
}