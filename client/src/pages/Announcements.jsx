import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Loader2, Megaphone, Send, Users, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useDarkMode } from '../hooks/DarkModeContext';

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [sendMode, setSendMode] = useState('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const { dark } = useDarkMode();

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      const data = await api.getAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    if (sendMode === 'later' && !scheduleAt) {
      toast.error('Please select a schedule date and time');
      return;
    }
    setSending(true);
    try {
      const payload = {
        message: message.trim(),
        age_min: ageMin ? parseInt(ageMin) : null,
        age_max: ageMax ? parseInt(ageMax) : null,
      };
      if (sendMode === 'later') {
        payload.scheduled_at = new Date(scheduleAt).toISOString();
      }
      const data = await api.sendAnnouncement(payload);
      if (sendMode === 'later') {
        toast.success(`Scheduled for ${new Date(scheduleAt).toLocaleString()}`);
      } else {
        toast.success(`Sent to ${data.recipients} resident${data.recipients !== 1 ? 's' : ''}`);
      }
      setMessage('');
      setAgeMin('');
      setAgeMax('');
      setScheduleAt('');
      setSendMode('now');
      await loadAnnouncements();
    } catch (err) {
      toast.error(err.message || 'Failed to send announcement');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h1 className={`text-3xl font-bold mb-2 ${dark ? 'text-white' : 'text-black'}`}>Announcements</h1>
        <p className={`mb-8 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Send broadcast messages to residents</p>

        {/* New Announcement */}
        <Card className="p-6 mb-8">
          <h2 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${dark ? 'text-white' : 'text-black'}`}>
            <Megaphone className="w-5 h-5" />
            New Announcement
          </h2>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your announcement here..."
            className={`w-full border rounded-lg px-4 py-3 mb-4 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${dark ? 'bg-gray-700 text-white border-gray-600 placeholder-gray-400' : ''}`}
          />

          {/* Age Range */}
          <div className="flex flex-wrap gap-4 mb-4 items-end">
            <div>
              <label className={`text-sm mb-1 block ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Age Range (optional)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  className="w-24"
                  min="10"
                  max="120"
                />
                <span className={dark ? 'text-gray-500' : 'text-gray-400'}>to</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  className="w-24"
                  min="10"
                  max="120"
                />
              </div>
            </div>
            <div className={`flex items-center gap-2 text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              <Users className="w-4 h-4" />
              <span>Leave blank to send to all residents</span>
            </div>
          </div>

          {/* Send Mode Toggle */}
          <div className="mb-4">
            <label className={`text-sm mb-2 block ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Send Timing</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSendMode('now')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  sendMode === 'now'
                    ? 'bg-blue-600 text-white'
                    : dark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Send className="w-4 h-4" />
                Send Now
              </button>
              <button
                type="button"
                onClick={() => setSendMode('later')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  sendMode === 'later'
                    ? 'bg-blue-600 text-white'
                    : dark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                  >
                <Clock className="w-4 h-4" />
                Schedule
              </button>
            </div>
          </div>

          {/* DateTime Picker */}
          {sendMode === 'later' && (
            <div className="mb-4">
              <label className={`text-sm mb-1 block ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Schedule Date & Time</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className={`border rounded-lg px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${dark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white'}`}
              />
            </div>
          )}

          <Button onClick={handleSend} disabled={sending || !message.trim()} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sendMode === 'later' ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : sendMode === 'later' ? 'Schedule Announcement' : 'Send Announcement'}
          </Button>
        </Card>

        {/* Sent Announcements */}
        <h2 className={`text-xl font-semibold mb-4 ${dark ? 'text-white' : 'text-black'}`}>Announcement History</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-16">
            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className={dark ? 'text-gray-400' : 'text-gray-500'}>No announcements yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-start gap-3">
                  {a.status === 'scheduled' ? (
                    <Clock className="w-5 h-5 text-purple-500 mt-0.5" />
                  ) : (
                    <Send className="w-5 h-5 text-green-500 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-gray-700 ${dark ? 'text-gray-300' : ''}`}>{a.message}</p>
                    <div className={`flex flex-wrap gap-4 mt-2 text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {a.status === 'scheduled' ? (
                        <span className="text-purple-600 font-medium">Scheduled</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {a.recipient_count} recipients
                        </span>
                      )}
                      {(a.age_min || a.age_max) && (
                        <span>Age: {a.age_min || '10'}-{a.age_max || '120'}</span>
                      )}
                      {a.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(a.scheduled_at).toLocaleString()}
                        </span>
                      )}
                      <span>{new Date(a.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}