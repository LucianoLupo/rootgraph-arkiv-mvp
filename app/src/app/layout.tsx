import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AppPrivyProvider } from '@/providers/privy-provider';
import { Toaster } from '@/components/ui/toaster';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'RootGraph — Own Your Professional Network',
  description:
    'A decentralized trust graph powered by Arkiv Network. Your connections live on-chain.',
  openGraph: {
    title: 'RootGraph — Own Your Professional Network',
    description: 'A decentralized trust graph powered by Arkiv Network.',
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppPrivyProvider>
          {children}
          <Toaster />
        </AppPrivyProvider>
      </body>
    </html>
  );
}
