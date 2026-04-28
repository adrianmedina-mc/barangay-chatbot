import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loader2, Inbox, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const data = await api.getReports();
      setReports(data);
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateReport(id, status);
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      toast.success(`Report #${id} marked as ${status.replace('_', ' ')}`);
    } catch (err) {
      toast.error('Failed to update report');
    }
  };

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold">Reports</h1>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded-lg px-4 py-2 bg-white shadow-sm"
          >
            <option value="all">All Reports</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <p className="text-gray-500 mb-8">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No reports found</p>
            <p className="text-gray-400 text-sm">Reports submitted by residents will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((report) => {
              const StatusIcon = statusConfig[report.status]?.icon || Clock;
              return (
                <Card key={report.id} className="p-5 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-lg">#{report.id}</span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[report.status]?.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[report.status]?.label}
                        </span>
                        <span className="text-gray-400 text-sm">• {report.category}</span>
                      </div>
                      <p className="text-gray-700 mb-2">{report.description}</p>
                      <p className="text-gray-400 text-sm">
                        From: <span className="font-medium text-gray-600">{report.first_name} {report.last_name}</span> • {report.address} • {new Date(report.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {report.status === 'pending' && (
                        <Button size="sm" onClick={() => handleStatusChange(report.id, 'in_progress')}>
                          Start Working
                        </Button>
                      )}
                      {report.status === 'in_progress' && (
                        <Button size="sm" onClick={() => handleStatusChange(report.id, 'resolved')}>
                          Resolve
                        </Button>
                      )}
                      {report.status === 'resolved' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(report.id, 'pending')}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}