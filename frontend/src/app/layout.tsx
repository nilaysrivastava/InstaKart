import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://main.d2a6skx8ok931x.amplifyapp.com"),
  title: "InstaKart",
  description: "Instant AI-powered cart for urgent shopping needs.",
  applicationName: "InstaKart",

  openGraph: {
    title: "InstaKart",
    description: "Instant AI-powered cart for urgent shopping needs.",
    url: "https://main.d2a6skx8ok931x.amplifyapp.com",
    siteName: "InstaKart",
    type: "website",
    images: [
      {
        url: "./og-image.png",
        width: 1200,
        height: 630,
        alt: "InstaKart",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "InstaKart",
    description: "Instant AI-powered cart for urgent shopping needs.",
    images: ["./og-image.png"],
  },

  icons: {
    icon: "./favicon.ico",
    shortcut: "./favicon.ico",
    apple: "./apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
