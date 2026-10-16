import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Oldham FirstStep | Find your first doable step",
  description:
    "A barrier-aware prototype helping 16–17-year-olds in Oldham reach a practical next step in education or training.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
