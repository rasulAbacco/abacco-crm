import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-64">
        <Header />
        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
