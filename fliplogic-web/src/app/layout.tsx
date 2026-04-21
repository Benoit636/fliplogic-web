import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlipLogic | Professional Vehicle Appraisal Platform',
  description: 'Smart appraisals, faster deals, better profits. Used by professional dealers and flippers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900">
        {children}
      </body>
    </html>
  );
}
