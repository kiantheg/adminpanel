import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Humor Project Admin Console",
  description: "Superadmin dashboard for profiles, images, captions, and internal data tables",
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
