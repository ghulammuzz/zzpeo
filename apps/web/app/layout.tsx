import type { Metadata } from "next"
import { Chakra_Petch, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { AppShell } from "@/components/layout/AppShell"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"

const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-chakra",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "zzpeo — Server & Deployment Manager",
  description: "Internal server and deployment management platform",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${chakraPetch.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
