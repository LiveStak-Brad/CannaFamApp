import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/shell/topnav";
import { TopNavAuth } from "@/components/shell/topnav-auth";
import { BottomNav, type NavSessionState } from "@/components/shell/bottomnav";
import { LiveIndicator } from "@/components/LiveIndicator";
import { getAuthedUserOrNull } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CannaFam (CFM)",
  description: "CannaFam Member loyalty hub for CannaStreams",
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let navState: NavSessionState = "guest";
  let anonymousGiftTotalCents = 0;

  const user = await getAuthedUserOrNull();
  try {
    const sb = await supabaseServer();
    const { data } = await sb.rpc("cfm_anonymous_gift_total_cents");
    anonymousGiftTotalCents = Number(data ?? 0);
  } catch {
    anonymousGiftTotalCents = 0;
  }
  if (user) {
    const sb = await supabaseServer();
    const { data: adminRow } = await sb
      .from("cfm_admins")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminRow?.role) {
      navState = "admin";
    } else {
      const { data, error } = await sb
        .from("cfm_members")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        navState = "unapproved";
      } else {
        navState = data ? "member" : "unapproved";
      }
    }
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TopNav right={<TopNavAuth />} />
        <LiveIndicator />
        {children}
        <BottomNav state={navState} anonymousGiftTotalCents={anonymousGiftTotalCents} />
      </body>
    </html>
  );
}
