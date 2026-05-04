import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "DroneSpace — Share Aerial Footage by Location",
  description:
    "Upload, discover and rate drone videos. Find aerial footage by GPS coordinates from creators around the world.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Inline script applies the saved/system theme before React hydrates,
  // which prevents a flash of the wrong theme on first paint.
  const themeBootstrap = `
    (function() {
      try {
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var dark = stored ? stored === 'dark' : prefersDark;
        if (dark) document.documentElement.classList.add('dark');
      } catch (e) {}
    })();
  `;

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
