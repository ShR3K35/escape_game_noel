import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import AdminPage from "./pages/AdminPage";
import HomePage from "./pages/HomePage";
import KidsPage from "./pages/KidsPage";
import NotFoundPage from "./pages/NotFoundPage";
import StatusPage from "./pages/StatusPage";
import TvPage from "./pages/TvPage";

const TITLES: Record<string, string> = {
  "/": "Noël 2026",
  "/admin": "Maître du jeu · Noël 2026",
  "/lutins": "Mission des lutins",
  "/tv": "Bureau du Père Noël",
  "/status": "État du jeu · Noël 2026",
};

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ?? "Noël 2026";
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/lutins" element={<KidsPage />} />
      <Route path="/tv" element={<TvPage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
