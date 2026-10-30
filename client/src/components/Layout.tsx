import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Kanban,
  BarChart3,
  Users,
  ChevronDown,
  LogOut,
  Bell,
  Search,
  Menu,
  X,
  CheckSquare,
  ListTodo,
  Settings,
  UserCheck,
  FolderKanban,
  AlarmClock,
} from "lucide-react";
import logoFull from "../assets/img/logo/logo.jpg";
import logoSmall from "../assets/img/logo/logo-small.jpg";
import toast from "react-hot-toast";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // State quản lý Sidebar mobile & Submenu
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTaskSubmenuOpen, setIsTaskSubmenuOpen] = useState(true);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown user khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    toast.success("Đã đăng xuất.");
    navigate("/login");
  };

  // Class style chung cho Menu Link Chính
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
      isActive
        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25"
        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
    }`;

  // Class style cho Submenu Link
  const subNavItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 pl-9 pr-3 py-2 rounded-lg text-xs font-semibold transition-all ${
      isActive
        ? "text-blue-600 bg-blue-50/80 font-bold"
        : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
    }`;

  return (
    <div className="min-h-screen bg-slate-100/60 flex flex-col font-sans">
      {/* 1. HEADER BÊN TRÊN */}
      <header className="h-16 bg-white border-b border-slate-200/80 sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6 shadow-sm">
        {/* Góc trái Header: Chỉ giữ Logo */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center h-8 cursor-pointer select-none"
            onClick={() => navigate("/dashboard")}
          >
            <img
              src={logoFull}
              alt="TOMOTEK"
              className="h-8 w-auto object-contain"
            />
          </div>
        </div>

        {/* Góc phải Header: Thông báo & Tài khoản User */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Nút Thông báo */}
          <button className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white animate-pulse"></span>
          </button>

          <div className="h-6 w-[1px] bg-slate-200/80 my-auto"></div>

          {/* User Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
              className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100/80 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-orange-400 text-white font-black text-xs flex items-center justify-center border border-white shadow-sm">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="text-left hidden md:block">
                <span className="text-xs font-bold text-slate-800 block leading-tight">
                  {user?.name || "Nguyen Van An"}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block">
                  Quản lý dự án
                </span>
              </div>
              <ChevronDown
                size={14}
                className={`text-slate-400 hidden md:block transition-transform duration-200 ${
                  isUserDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Menu Dropdown khi click User */}
            {isUserDropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-lg border border-slate-200/80 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-800">
                    {user?.name || "Nguyen Van An"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    admin@techadmin.com
                  </p>
                </div>

                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                  >
                    <LogOut size={15} />
                    <span>Đăng xuất hệ thống</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. BODY CHÍNH (SIDEBAR + CONTENT) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Backdrop che mờ khi ở Mobile */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-10 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* SIDEBAR BÊN TRÁI */}
        <aside
          className={`bg-white border-r border-slate-200/80 transition-all duration-300 ease-in-out flex flex-col z-20 shrink-0 ${
            isSidebarOpen
              ? "w-64"
              : "w-0 lg:w-16 -translate-x-full lg:translate-x-0 overflow-hidden"
          }`}
        >
          {/* Header của Sidebar: Chứa Title + Nút đóng / Nút mở */}
          {isSidebarOpen ? (
            <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
              <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">
                Menu
              </span>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Thu gọn menu"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex justify-center pt-3 pb-1">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Mở rộng menu"
              >
                <Menu size={20} />
              </button>
            </div>
          )}

          {/* Danh sách Menu */}
          <div className="p-3 flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
            {/* Menu Dashboard */}
            <NavLink to="/dashboard" className={navItemClass}>
              <LayoutDashboard size={18} className="shrink-0" />
              {isSidebarOpen && <span>Dashboard</span>}
            </NavLink>

            {/* Menu Quản lý công việc */}
            <div>
              <button
                onClick={() => setIsTaskSubmenuOpen(!isTaskSubmenuOpen)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 transition-colors ${
                  !isSidebarOpen ? "justify-center" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Kanban size={18} className="shrink-0 text-slate-600" />
                  {isSidebarOpen && <span>Quản lý công việc</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 text-slate-400 ${
                      isTaskSubmenuOpen ? "rotate-180" : ""
                    }`}
                  />
                )}
              </button>

              {/* Submenu xổ xuống */}
              {isTaskSubmenuOpen && isSidebarOpen && (
                <div className="mt-1 space-y-1">
                  <NavLink to="/kanban" className={subNavItemClass}>
                    <Kanban size={14} />
                    <span>Bảng Kanban</span>
                  </NavLink>
                  <NavLink to="/tasks" className={subNavItemClass}>
                    <ListTodo size={14} />
                    <span>Danh sách Task</span>
                  </NavLink>
                  <NavLink to="/urgent" className={subNavItemClass}>
                    <AlarmClock size={14} />
                    <span>Công việc gấp</span>
                  </NavLink>
                </div>
              )}
            </div>

            {/* Menu Báo cáo */}
            <NavLink to="/projects" className={navItemClass}>
              <FolderKanban size={18} className="shrink-0" />
              {isSidebarOpen && <span>Quản lý Dự án</span>}
            </NavLink>

            {/* Menu Báo cáo */}
            <NavLink to="/reports" className={navItemClass}>
              <BarChart3 size={18} className="shrink-0" />
              {isSidebarOpen && <span>Báo cáo & Thống kê</span>}
            </NavLink>

            {/* Menu Quản lý nhân sự */}
            {user?.role === 'admin' && (
              <NavLink to="/users" className={navItemClass}>
                <Users size={18} className="shrink-0" />
                {isSidebarOpen && <span>Quản lý nhân sự</span>}
              </NavLink>
            )}
          </div>

          {/* Footer dưới cùng của Sidebar */}
          {isSidebarOpen && (
            <div className="p-3 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200/80 bg-white text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200/80 transition-all shadow-xs"
              >
                <LogOut size={14} />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </aside>

        {/* NỘI DUNG CHÍNH (MAIN) */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
