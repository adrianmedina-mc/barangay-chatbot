import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loader2, Inbox, Clock, CheckCircle2, AlertCircle, Trash2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useDarkMode } from '../hooks/DarkModeContext';

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [replyModal, setReplyModal] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const { dark } = useDarkMode();
  const [dateFilter, setDateFilter] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    setLoading(true);
    loadReports();
  }, [dateFilter, customStart, customEnd]);

  const loadReports = async () => {
    console.log('Loading reports with filter:', dateFilter, customStart, customEnd);
    try {
      let start, end;
      const now = new Date();
      
      if (dateFilter === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        start = todayStart.toISOString();
        // End is end of today
        const todayEnd = new Date(todayStart);
        todayEnd.setHours(23, 59, 59, 999);
        end = todayEnd.toISOString();
      }else if (dateFilter === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        start = weekAgo.toISOString();
        end = now.toISOString();
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        start = monthAgo.toISOString();
        end = now.toISOString();
      } else if (dateFilter === 'custom' && customStart) {
        start = customStart;
        end = customEnd || now.toISOString();
      }

      const data = await api.getReports(start, end);
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

  const handleDelete = async (id) => {
    if (!confirm('Delete this report permanently?')) return;
    try {
      await api.deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      toast.success('Report deleted');
    } catch (err) {
      toast.error('Failed to delete report');
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      await api.replyToReport(replyModal, replyText);
      toast.success('Reply sent to resident');
      setReplyModal(null);
      setReplyText('');
    } catch (err) {
      toast.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <div className="flex justify-between items-center mb-2">
          <h1 className={`text-3xl font-bold ${dark ? 'text-white' : 'text-black'}`}>Reports</h1>
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`border rounded-lg px-4 py-2 shadow-sm ${dark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white'}`}
            >
            <option value="all">All Reports</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        {/* Date Filter */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className={`border rounded-lg px-4 py-2 shadow-sm ${dark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white'}`}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={`border rounded-lg px-3 py-2 shadow-sm ${dark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white'}`}
              />
              <span className={dark ? 'text-gray-400' : 'text-gray-500'}>to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={`border rounded-lg px-3 py-2 shadow-sm ${dark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white'}`}
              />
            </div>
          )}
        </div>
        <p className={`mb-8 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{filtered.length} report{filtered.length !== 1 ? 's' : ''}</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className={`text-lg ${dark ? 'text-gray-400' : 'text-gray-500'}`}>No reports found</p>
            <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Reports submitted by residents will appear here</p>
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
                        <span className={`font-semibold text-lg ${dark ? 'text-white' : 'text-black'}`}>#{report.id}</span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[report.status]?.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[report.status]?.label}
                        </span>
                        <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-400'}`}>• {report.category}</span>
                      </div>
                      <p className={`mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{report.description}</p>
                      <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                        From: <span className={`font-medium ${dark ? 'text-gray-200' : 'text-gray-600'}`}>{report.first_name} {report.last_name}</span> • {report.address} • {new Date(report.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {report.status === 'pending' && (
                        <Button size="sm" variant="default" onClick={() => handleStatusChange(report.id, 'in_progress')}>
                          Start Working
                        </Button>
                      )}
                      {report.status === 'in_progress' && (
                        <Button size="sm" variant="default" onClick={() => handleStatusChange(report.id, 'resolved')}>
                          Resolve
                        </Button>
                      )}
                      {report.status === 'resolved' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(report.id, 'pending')} className={dark ? 'text-white border-gray-500 hover:bg-gray-700' : ''}>
                          Reopen
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setReplyModal(report.id)} className={dark ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-500 hover:text-blue-700'}>
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(report.id)} className={dark ? 'text-red-400 hover:bg-gray-700' : 'text-red-500 hover:text-red-700'}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Reply Modal */}
        {replyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setReplyModal(null); setReplyText(''); }}>
            <div className={`rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl ${dark ? 'bg-gray-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
              <h3 className={`text-lg font-semibold mb-1 ${dark ? 'text-white' : 'text-black'}`}>Reply to Report #{replyModal}</h3>
              <p className={`text-sm mb-4 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Message will be sent to the resident via Messenger</p>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply here..."
                className={`w-full border rounded-lg px-4 py-3 h-32 resize-none mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 ${dark ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-400' : ''}`}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setReplyModal(null); setReplyText(''); }}>
                  Cancel
                </Button>
                <Button onClick={handleReply} disabled={!replyText.trim() || sendingReply}>
                  {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reply'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}