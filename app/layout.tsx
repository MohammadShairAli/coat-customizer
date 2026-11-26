import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const SITE_URL = "https://suite-customizer.blenspark.com";
const SITE_NAME = "The Atelier | 3D Coat Customizer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0e10",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "The Atelier | Bespoke 3D Coat & Blazer Customizer",
    template: "%s | The Atelier",
  },
  description:
    "Customize tailored coats and blazers in real-time 3D. Explore Camel Twill, Sage Corduroy, Charcoal Pinstripe, Cream Linen, and Highland Check with bespoke fabric dyes and button finishes.",
  keywords: [
    "bespoke coat customizer",
    "3D blazer configurator",
    "custom tailored sport coat",
    "made to measure blazer",
    "linen blazer customizer",
    "tartan sport coat",
    "3D garment studio",
  ],
  applicationName: "The Atelier",
  authors: [{ name: "The Atelier" }],
  creator: "The Atelier",
  publisher: "The Atelier",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "The Atelier | Bespoke 3D Coat & Blazer Customizer",
    description:
      "Select a signature weave, preview in 360° 3D, and customize fabric dye and button hardware in real time.",
    images: [
      {
        url: "/coats/Coat-4.jpg",
        width: 1200,
        height: 1500,
        alt: "The Atelier — Bespoke 3D Coat & Blazer Customizer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Atelier | Bespoke 3D Coat & Blazer Customizer",
    description:
      "Customize tailored coats and blazers in real-time 3D with bespoke dyes and button finishes.",
    images: ["/coats/Coat-4.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "The Atelier",
        url: SITE_URL,
        description:
          "Bespoke 3D tailoring studio for customizing tailored coats, blazers, fabric dyes, and button hardware finishes.",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#configurator`,
        name: "The Atelier 3D Coat Customizer",
        url: SITE_URL,
        applicationCategory: "DesignApplication",
        operatingSystem: "All",
        browserRequirements: "Requires WebGL / HTML5",
        featureList: [
          "360-degree interactive 3D garment inspection",
          "Real-time fabric dye customization across Camel Twill, Sage Corduroy, Charcoal Pinstripe, Cream Linen, and Highland Check",
          "Custom button hardware selector (Jet Black, Slate Grey, Ivory White, Reddish Brown, Woven Gold, Emerald Green)",
        ],
      },
    ],
  };

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}