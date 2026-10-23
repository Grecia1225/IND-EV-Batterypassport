import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { LangProvider } from "./lib/i18n";
import { NavBar } from "./components/NavBar";
import { Home } from "./pages/Home";
import { Passport } from "./pages/Passport";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { AddReading } from "./pages/AddReading";
import { Dashboard } from "./pages/Dashboard";
import { Marketplace } from "./pages/Marketplace";
import { Scan } from "./pages/Scan";
import { Compare } from "./pages/Compare";
import { ActivityLog } from "./pages/ActivityLog";

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/p/:id" element={<Passport />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/add-reading" element={<AddReading />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/activity" element={<ActivityLog />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  );
}