import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "V -1",
  description: "RSC Generator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body
        className={`${inter.className} p-4 flex flex-col items-center min-h-screen bg-gray-100`}
      >
        <main className="max-w-screen-xl w-full h-full grow flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
