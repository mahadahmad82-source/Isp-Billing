import React, { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface OnboardingTourProps {
  managerName: string;
  onComplete: () => void;
  onNavigate: (tab: string) => void;
  theme: 'light' | 'dark';
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ managerName, onComplete, onNavigate, theme }) => {
  useEffect(() => {
    // We add a short timeout to ensure the DOM is fully rendered
    const timeout = setTimeout(() => {
      const tourDriver = driver({
        showProgress: true,
        animate: true,
        allowClose: false,
        steps: [
          {
            popover: {
              title: `Welcome, ${managerName}! 🚀`,
              description: 'This is My ISP, your complete business control center. We’ve redesigned it to be faster and more intuitive. Let’s take a quick 1-minute tour of the main features.',
              side: "over",
              align: 'start'
            }
          },
          {
            element: '#tour-sidebar-nav',
            popover: {
              title: 'Main Navigation 🧭',
              description: 'Navigate easily between your Master Directory (Customers), Receipt Generation, Recoveries, Expiries & automated alerts, and AI Insights. A centralized hub for operations.',
              side: "right",
              align: 'start'
            }
          },
          {
            element: '#tour-top-header',
            popover: {
              title: 'Real-time Synchronization ☁️',
              description: 'Your data is secured locally and can sync with the cloud. The integrity check timer at the top always lets you know the last successful state capture.',
              side: "bottom",
              align: 'start'
            }
          },
          {
            element: '#tour-header-actions',
            popover: {
              title: 'Action Center 🔔',
              description: 'Access system notifications immediately. Critical alerts (like pending expiries) will pulse red here. You can also toggle the gorgeous Dark Mode instantly.',
              side: "bottom",
              align: 'end'
            }
          },
          {
            element: '#tour-reminder-hub',
            popover: {
              title: '3-Day Reminder Hub ⚡',
              description: 'If any customers have subscriptions expiring in exactly 3 days, this automated hub appears. Click "Run Automation Sequence" to instantly execute pre-filled SMS or WhatsApp alerts.',
              side: "bottom",
              align: 'start'
            }
          },
          {
            element: '#tour-stats-grid',
            popover: {
              title: 'Real-Time Metrics 📊',
              description: 'Monitor your Revenue, Outstanding Balances, Total Subscriptions, and Active Customers precisely. You can click to hide financial values if you are in a public environment.',
              side: "bottom",
              align: 'start'
            }
          },
          {
            element: '#tour-recent-transactions',
            popover: {
              title: 'Live Ledger 🧾',
              description: 'All recent payments are tracked dynamically here. You can discard mistaken transactions or click "View Full Ledger" to open the detailed Receipt Generator.',
              side: "top",
              align: 'start'
            }
          },
          {
            element: '#tour-recovery-alerts',
            popover: {
              title: 'Priority Alerts 🚨',
              description: 'Shows users whose subscription expires exactly in 3 days. Send ultra-fast WhatsApp/SMS payment reminders in one click.',
              side: "top",
              align: 'start'
            }
          },
          {
            element: '#tour-overdue-collections',
            popover: {
              title: 'Overdue Collections 💰',
              description: 'Tracks customers who are actively expired and have an outstanding balance due. You can quickly see the exact amount to recover and initiate contact.',
              side: "top",
              align: 'start'
            }
          },
          {
            element: '#tour-profile-menu',
            popover: {
              title: 'Manager Profile & Setup ⚙️',
              description: 'Done with the tour! Remember to click your Profile/Avatar to securely manage credentials, switch business accounts, or log out of the offline terminal.',
              side: "right",
              align: 'start'
            }
          }
        ],
        onDestroyed: () => {
          onComplete();
        },
      });

      tourDriver.drive();
    }, 500);

    return () => clearTimeout(timeout);
  }, []); // Only run once on mount

  // Render nothing as driver.js handles the overlay
  return null;
};

export default OnboardingTour;

