import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GLITCHED — Same room. Different reality.",
  description:
    "A live multiplayer deduction game for 3–12 friends. Private prompts, questionable answers, one hidden Glitch. No accounts needed.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
