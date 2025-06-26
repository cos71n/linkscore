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
        {/* Meta Pixel Code */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '111978718406199');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img height="1" width="1" style={{display: 'none'}}
          src="https://www.facebook.com/tr?id=111978718406199&ev=PageView&noscript=1"
          />
        </noscript>
        {/* End Meta Pixel Code */}
      </head>
      <body className={`${inter.variable} font-sans antialiased h-full bg-gray-50 text-gray-900`}>
        <div id="root" className="min-h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
