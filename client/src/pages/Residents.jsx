import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { Loader2, Users, Search } from 'lucide-react';

export default function Residents() {
  const [residents, setResidents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getResidents()
      .then(setResidents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        <p className="text-gray-500 mb-6">Manage registered barangay residents</p>

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
            <p className="text-gray-400 text-sm">Residents will appear here after they register through the chatbot</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((r) => (
              <Card key={r.id} className="p-5 flex justify-between items-center hover:shadow-md transition-shadow">
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
      </main>
    </div>
  );
}