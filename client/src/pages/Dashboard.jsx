import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { useDarkMode } from '../hooks/DarkModeContext';
import { FileText, Users, Megaphone, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
const STATUS_COLORS = { pending: '#f59e0b', in_progress: '#3b82f6', resolved: '#10b981' };

export default function Dashboard() {
  const [stats, setStats] = useState({ reports: 0, residents: 0, announcements: 0 });
  const [chartData, setChartData] = useState({ byCategory: [], byStatus: [] });
  const [loading, setLoading] = useState(true);
  const { dark } = useDarkMode();

  useEffect(() => {
    async function load() {
      try {
        const [reports, residents, announcements, reportStats] = await Promise.all([
          api.getReports(),
          api.getResidents(),
          api.getAnnouncements(),
          api.getReportStats(),
        ]);
        setStats({
          reports: reports.length,
          residents: residents.length,
          announcements: announcements.length,
        });
        setChartData(reportStats);
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
        <h1 className={`text-3xl font-bold mb-2 ${dark ? 'text-white' : 'text-black'}`}>Dashboard</h1>
        <p className={`mb-8 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Overview of barangay communication activity</p>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {cards.map((card) => (
            <Card key={card.label} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium mt-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {card.label}
                  </p>
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400 mt-2" />
                  ) : (
                    <p className={`text-3xl font-bold mt-2 ${dark ? 'text-white' : 'text-black'}`}>
                      {card.value}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-full ${card.color}`}>
                  <card.icon className="w-6 h-6" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Charts */}
        {!loading && (chartData.byCategory.length > 0 || chartData.byStatus.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart - Reports by Category */}
            <Card className="p-6">
              <h2 className={`text-lg font-semibold mb-4 ${dark ? 'text-white' : 'text-gray-900'}`}>
                Reports by Category
              </h2>
              {chartData.byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.byCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#374151' : '#e5e7eb'} />
                    <XAxis 
                      dataKey="category" 
                      tick={{ fontSize: 12, fill: dark ? '#d1d5db' : '#374151' }} 
                    />
                    <YAxis 
                      tick={{ fontSize: 12, fill: dark ? '#d1d5db' : '#374151' }} 
                      allowDecimals={false} 
                    />
                    <Tooltip 
                      contentStyle={{ 
                      backgroundColor: dark ? '#1f2937' : '#fff', 
                      border: dark ? '1px solid #374151' : '1px solid #e5e7eb',
                      color: dark ? '#e5e7eb' : '#1f2937'
                    }} 
                    />
                    <Bar dataKey="count" name="Reports" radius={[6, 6, 0, 0]}>
                      {chartData.byCategory.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-center py-12">No report data yet</p>
              )}
            </Card>

            {/* Pie Chart - Reports by Status */}
            <Card className="p-6">
              <h2 className={`text-lg font-semibold mb-4 ${dark ? 'text-white' : 'text-gray-900'}`}>
                Reports by Status
              </h2>
              {chartData.byStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chartData.byStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ status, count }) => `${status.replace('_', ' ')}: ${count}`}
                      labelStyle={{ fill: dark ? '#d1d5db' : '#374151', fontSize: 12 }}
                    >
                      {chartData.byStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: dark ? '#1f2937' : '#fff', 
                        border: dark ? '1px solid #374151' : '1px solid #e5e7eb',
                        color: dark ? '#e5e7eb' : '#1f2937'
                      }} 
                    />
                    <Legend 
                      formatter={(value) => <span style={{ color: dark ? '#d1d5db' : '#374151' }}>{value.replace('_', ' ')}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-center py-12">No status data yet</p>
              )}
            </Card>
          </div>
        )}

        {!loading && chartData.byCategory.length === 0 && chartData.byStatus.length === 0 && (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className={dark ? 'text-gray-400' : 'text-gray-500'}>No report data to display yet</p>
            <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Charts will appear once residents submit reports</p>
          </div>
        )}
      </main>
    </div>
  );
}