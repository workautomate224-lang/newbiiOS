import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FutureOS — AI Prediction Engine",
  description: "AI prediction platform powered by multi-agent simulation and three-engine reasoning. Causal graph visualization, real-time variable manipulation, professional-grade analysis.",
  keywords: ["AI prediction", "causal reasoning", "prediction market", "agent simulation", "FutureOS"],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "FutureOS — AI Prediction Engine",
    description: "Explore the future of any question with AI-powered causal reasoning",
    url: "https://futureos.app",
    siteName: "FutureOS",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FutureOS — AI Prediction Engine",
    description: "Explore the future of any question with AI-powered causal reasoning",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#030712",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
