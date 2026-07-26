import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import MyAssets from './pages/MyAssets';
import Minigames from './pages/Minigames';
import Wallet from './pages/Wallet';
import Profile from './pages/Profile';
import Storage from './pages/Storage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="shop" element={<MyAssets />} />
            <Route path="minigames" element={<Minigames />} />
            <Route path="wallet" element={<Wallet />} />
            <Route path="profile" element={<Profile />} />
            <Route path="storage" element={<Storage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}