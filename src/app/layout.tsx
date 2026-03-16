import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Turo Fleet Manager',
  description: 'Fleet management for Eduardo\'s Turo rental business',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
