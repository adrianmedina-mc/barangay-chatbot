import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Sidebar from '../components/layout/Sidebar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Loader2, Megaphone, Send, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

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
    setSending(true);
    try {
      const data = await api.sendAnnouncement({
        message: message.trim(),
        age_min: ageMin ? parseInt(ageMin) : null,
        age_max: ageMax ? parseInt(ageMax) : null,
      });
      toast.success(`Sent to ${data.recipients} resident${data.recipients !== 1 ? 's' : ''}`);
      setMessage('');
      setAgeMin('');
      setAgeMax('');
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
        <h1 className="text-3xl font-bold mb-2">Announcements</h1>
        <p className="text-gray-500 mb-8">Send broadcast messages to residents</p>

        <Card className="p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            New Announcement
          </h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your announcement here..."
            className="w-full border rounded-lg px-4 py-3 mb-4 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
          />
          <div className="flex flex-wrap gap-4 mb-4 items-end">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Age Range (optional)</label>
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
                <span className="text-gray-400">to</span>
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
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Users className="w-4 h-4" />
              <span>Leave blank to send to all residents</span>
            </div>
          </div>
          <Button onClick={handleSend} disabled={sending || !message.trim()} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : 'Send Announcement'}
          </Button>
        </Card>

        <h2 className="text-xl font-semibold mb-4">Sent Announcements</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-16">
            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No announcements sent yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id} className="p-4">
                <p className="text-gray-700">{a.message}</p>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {a.recipient_count} recipients
                  </span>
                  {(a.age_min || a.age_max) && (
                    <span>Age: {a.age_min || '10'}-{a.age_max || '120'}</span>
                  )}
                  <span>{new Date(a.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}