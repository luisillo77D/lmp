import type { Metadata } from "next";
import { Suspense } from "react";
import { Newsreader, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { isSupabaseConfigured } from "@/lib/supabase";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "El Cuaderno del Pacífico | Estadísticas y Análisis LMP",
  description:
    "Estadísticas de la Liga Mexicana del Pacífico, duelos de pitcheo, bullpen y proyecciones de carreras.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseReady = isSupabaseConfigured();
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <html
      lang="es"
      className={`${jakarta.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#FAF6F0] text-stone-900 font-sans selection:bg-amber-200/70 selection:text-stone-900">
        <Suspense fallback={<div className="h-16 border-b border-stone-200/80 bg-[#FAF6F0]" />}>
          <Navbar
            supabaseConfigured={supabaseReady}
            allowManualSync={supabaseReady && isDev}
          />
        </Suspense>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Suspense
            fallback={
              <div className="py-20 text-center text-sm text-stone-500">
                Cargando cuaderno de anotación y cartelera de la LMP...
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
        <footer className="border-t border-stone-200/80 bg-[#F3EDE2]/60 py-6 text-center text-xs text-stone-500">
          El Cuaderno del Pacífico · Datos Oficiales de Liga Invernal (Sport ID 17 / League ID 132)
        </footer>
      </body>
    </html>
  );
}
