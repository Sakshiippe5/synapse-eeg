import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "SynapseEEG — Neural Signal Dashboard",
  description: "Real-time EEG brain signal visualization, mood detection & neural analytics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="scanlines cyber-grid min-h-screen">
        {children}
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: "#0a0f1a",
              border: "1px solid #1a2540",
              color: "#e0f0ff",
            },
          }}
        />
      </body>
    </html>
  );
}
