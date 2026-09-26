import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omni Agent",
  description: "An AI assistant with a live browser it can navigate for you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
