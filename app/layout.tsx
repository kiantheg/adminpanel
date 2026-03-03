import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Humor Project Admin Panel",
  description: "Super admin dashboard for profiles, images, and captions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
