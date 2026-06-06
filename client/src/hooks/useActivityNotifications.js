import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';

export function useActivityNotifications() {
  // Store the time the page was loaded (or last checked)
  const lastCheck = useRef(new Date().toISOString());

  useEffect(() => {
    const checkActivity = async () => {
      try {
        const data = await api.getNewActivity(lastCheck.current);
        
        if (data.newReports > 0) {
          toast.info(`📝 ${data.newReports} new report(s) submitted!`);
        }
        if (data.newResidents > 0) {
          toast.info(`👤 ${data.newResidents} new resident(s) registered!`);
        }

        // Update the last check time to now
        lastCheck.current = new Date().toISOString();
      } catch (err) {
        // Silently fail for notifications
        console.error("Activity check failed:", err);
      }
    };

    // Check immediately, then every 15 seconds
    checkActivity();
    const interval = setInterval(checkActivity, 15000);

    return () => clearInterval(interval);
  }, []);
}