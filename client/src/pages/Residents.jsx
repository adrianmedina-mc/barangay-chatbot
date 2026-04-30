import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { Loader2, Users, Search, MapPin, Calendar, FileText, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button'; 
import { useDarkMode } from '../hooks/DarkModeContext';

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
  const [modalOpen, setModalOpen] = useState(false);
  const { dark } = useDarkMode();

  useEffect(() => {
    api.getResidents()
      .then(setResidents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete ${name} and all their reports permanently?`)) return;
    try {
      await api.deleteResident(id);
      setResidents((prev) => prev.filter((r) => r.id !== id));
      toast.success('Resident deleted');
    } catch (err) {
      toast.error('Failed to delete resident');
    }
  };

  const openProfile = async (id) => {
    setProfileLoading(true);
    setModalOpen(true);
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

  const closeProfile = () => {
    setModalOpen(false);
    setSelected(null);
    setProfileLoading(false);
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
          <h1 className={`text-3xl font-bold ${dark ? 'text-white' : 'text-black'}`}>Residents</h1>
          <span className={dark ? 'text-gray-400' : 'text-gray-500'}>{residents.length} registered</span>
        </div>
        <p className={`mb-6 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Click a resident to view full profile</p>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full border rounded-lg pl-10 pr-4 py-2.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${dark ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-400' : 'bg-white'}`}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className={`text-lg ${dark ? 'text-gray-400' : 'text-gray-500'}`}>No residents found</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((r) => (
              <Card
                key={r.id}
                className="p-5 flex justify-between items-center hover:shadow-md transition-shadow cursor-pointer hover:border-blue-300 border-2 border-transparent"
                onClick={() => openProfile(r.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-sm">
                      {r.first_name?.[0]}{r.last_name?.[0]}
                    </span>
                  </div>
                  <div>
                    <p className={`font-semibold ${dark ? 'text-white' : 'text-black'}`}>{r.first_name} {r.last_name}</p>
                    <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Age: {r.age} • {r.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {new Date(r.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={(e) => { 
                      e.stopPropagation();
                      handleDelete(r.id, `${r.first_name} ${r.last_name}`); 
                    }} 
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Custom Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeProfile}>
            <div
              className={`rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4 ${dark ? 'bg-gray-800' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {profileLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : selected ? (
                <div>
                  {/* Header */}
                  <div className={`p-6 border-b flex items-center justify-between ${dark ? 'border-gray-700' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-xl">
                          {selected.first_name?.[0]}{selected.last_name?.[0]}
                        </span>
                      </div>
                      <div>
                        <h2 className={`text-xl font-bold ${dark ? 'text-white' : 'text-black'}`}>{selected.first_name} {selected.last_name}</h2>
                        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Resident #{selected.id}</p>
                      </div>
                    </div>
                    <button onClick={closeProfile} className={`p-2 rounded-lg ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Details */}
                  <div className={`p-6 grid grid-cols-2 gap-4 border-b ${dark ? 'border-gray-700' : ''}`}>
                    <div className={`flex items-center gap-2 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <Calendar className="w-4 h-4" />
                      <span>Age: <strong>{selected.age}</strong></span>
                    </div>
                    <div className={`flex items-center gap-2 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <MapPin className="w-4 h-4" />
                      <span>{selected.address}</span>
                    </div>
                    <div className={`flex items-center gap-2 col-span-2 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <Calendar className="w-4 h-4" />
                      <span>Registered: {new Date(selected.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Reports */}
                  <div className="p-6">
                    <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${dark ? 'text-white' : 'text-black'}`}>
                      <FileText className="w-5 h-5" />
                      Reports ({selected.total_reports})
                    </h3>
                    {selected.reports.length === 0 ? (
                      <p className="text-gray-400 text-center py-4">No reports submitted</p>
                    ) : (
                      <div className="space-y-3">
                        {selected.reports.map((report) => (
                          <div key={report.id} className={`border rounded-lg p-4 ${dark ? 'border-gray-700' : ''}`}>

                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-medium ${dark ? 'text-white' : 'text-black'}`}>#{report.id}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[report.status]?.color}`}>
                                {statusConfig[report.status]?.label}
                              </span>
                              <span className="text-gray-400 text-sm">{report.category}</span>
                            </div>
                            <p className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{report.description}</p>
                            <p className={`text-xs mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
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
        )}
      </main>
    </div>
  );
}