import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frame Ambient Engine",
  description: "Ambient display control panel for Samsung Frame TV",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-frame-bg text-frame-text antialiased">
        {children}
      </body>
    </html>
  );
}
