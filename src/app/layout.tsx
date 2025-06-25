import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "LinkScore - SEO Link Building Assessment Tool",
  description: "Keep your SEO service provider honest - find out if your link building investment is delivering results. Analyze your authority link profile and compare against competitors.",
  keywords: "SEO, link building, backlinks, SEO analysis, authority links, Australian SEO",
  authors: [{ name: "The SEO Show" }],
  creator: "The SEO Show",
  publisher: "The SEO Show",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    siteName: "LinkScore",
    title: "LinkScore - SEO Link Building Assessment Tool",
    description: "Keep your SEO service provider honest - find out if your link building investment is delivering results.",
    url: "https://linkscore.theseoshow.co",
  },
  twitter: {
    card: "summary_large_image",
    title: "LinkScore - SEO Link Building Assessment Tool",
    description: "Keep your SEO service provider honest - find out if your link building investment is delivering results.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="referrer" content="no-referrer-when-downgrade" />
      </head>
      <body className={`${inter.variable} font-sans antialiased h-full bg-gray-50 text-gray-900`}>
        <div id="root" className="min-h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
