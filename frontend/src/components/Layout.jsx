import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Navbar from "./Navbar.jsx";
import SupportChatbot from "./SupportChatbot.jsx";

export default function Layout() {
  const { pathname } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#f7f8f9]">
      <Navbar onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)} />
      <div className="min-h-[calc(100vh-88px)] md:flex">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-[1600px] px-5 py-7 sm:px-7 lg:px-11 lg:py-8">
          <Outlet />
          </main>
        </div>
      </div>
      <SupportChatbot />
    </div>
  );
}
