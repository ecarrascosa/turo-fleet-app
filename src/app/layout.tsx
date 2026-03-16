import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Turo Fleet Manager',
  description: 'Fleet management for Eduardo\'s Turo rental business',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
