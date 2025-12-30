import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'My CDN - Admin Panel',
  description: 'Personal file hosting CDN admin panel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-dark-900 text-white antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1F1F23',
              color: '#fff',
              border: '1px solid #3F3F46',
              fontFamily: 'JetBrains Mono, monospace',
            },
            success: {
              iconTheme: {
                primary: '#00FFD1',
                secondary: '#0A0A0B',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#0A0A0B',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
