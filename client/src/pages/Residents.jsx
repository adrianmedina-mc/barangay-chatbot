import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { Loader2, Users, Search, Mail, MapPin, Calendar, FileText, X } from 'lucide-react';

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700' },
};

export default function Residents() {
  const [residents, setResidents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    api.getResidents()
      .then(setResidents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openProfile = async (id) => {
    setProfileLoading(true);
    setSelected(null);
    try {
      const data = await api.getResident(id);
      setSelected(data);
    } catch (e) {
      console.error(e);
    } finally {
      setProfileLoading(false);
    }
  };

  const filtered = residents.filter((r) => {
    const name = `${r.first_name} ${r.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold">Residents</h1>
          <span className="text-gray-500">{residents.length} registered</span>
        </div>
        <p className="text-gray-500 mb-6">Click a resident to view full profile</p>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-lg pl-10 pr-4 py-2.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No residents found</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((r) => (
              <Card
                key={r.id}
                className="p-5 flex justify-between items-center hover:shadow-md transition-shadow cursor-pointer hover:border-blue-300"
                onClick={() => openProfile(r.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-sm">
                      {r.first_name?.[0]}{r.last_name?.[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">{r.first_name} {r.last_name}</p>
                    <p className="text-gray-500 text-sm">Age: {r.age} • {r.address}</p>
                  </div>
                </div>
                <p className="text-gray-400 text-sm">
                  {new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </Card>
            ))}
          </div>
        )}

        {/* Profile Dialog */}
        <Dialog open={!!selected || profileLoading} onOpenChange={() => { setSelected(null); setProfileLoading(false); }}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4">
              {profileLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : selected ? (
                <div>
                  {/* Header */}
                  <div className="p-6 border-b flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-xl">
                          {selected.first_name?.[0]}{selected.last_name?.[0]}
                        </span>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">{selected.first_name} {selected.last_name}</h2>
                        <p className="text-gray-500 text-sm">Resident #{selected.id}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Details */}
                  <div className="p-6 grid grid-cols-2 gap-4 border-b">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Age: <strong>{selected.age}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{selected.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 col-span-2">
                      <Calendar className="w-4 h-4" />
                      <span>Registered: {new Date(selected.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Reports */}
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Reports ({selected.total_reports})
                    </h3>
                    {selected.reports.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">No reports submitted</p>
                    ) : (
                      <div className="space-y-3">
                        {selected.reports.map((report) => (
                          <div key={report.id} className="border rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">#{report.id}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[report.status]?.color}`}>
                                {statusConfig[report.status]?.label}
                              </span>
                              <span className="text-gray-400 text-sm">{report.category}</span>
                            </div>
                            <p className="text-gray-600 text-sm">{report.description}</p>
                            <p className="text-gray-400 text-xs mt-1">
                              {new Date(report.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Dialog>
      </main>
    </div>
  );
}