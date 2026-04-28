import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { FileText, Users, Megaphone, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ reports: 0, residents: 0, announcements: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [reports, residents, announcements] = await Promise.all([
          api.getReports(),
          api.getResidents(),
          api.getAnnouncements(),
        ]);
        setStats({
          reports: reports.length,
          residents: residents.length,
          announcements: announcements.length,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const cards = [
    { label: 'Total Reports', value: stats.reports, icon: FileText, color: 'text-blue-600 bg-blue-100' },
    { label: 'Registered Residents', value: stats.residents, icon: Users, color: 'text-green-600 bg-green-100' },
    { label: 'Announcements Sent', value: stats.announcements, icon: Megaphone, color: 'text-purple-600 bg-purple-100' },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-500 mb-8">Overview of barangay communication activity</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card) => (
            <Card key={card.label} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">{card.label}</p>
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400 mt-2" />
                  ) : (
                    <p className="text-3xl font-bold mt-2">{card.value}</p>
                  )}
                </div>
                <div className={`p-3 rounded-full ${card.color}`}>
                  <card.icon className="w-6 h-6" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}