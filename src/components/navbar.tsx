"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, Database, RefreshCw, Trophy, Users } from "lucide-react";

interface NavbarProps {
  supabaseConfigured: boolean;
  allowManualSync?: boolean;
}

export function Navbar({ supabaseConfigured, allowManualSync = false }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const navItems = [
    { href: "/", label: "Cartelera y Picks", icon: BookOpen },
    { href: "/teams", label: "Posiciones y Equipos", icon: Trophy },
    { href: "/players", label: "Jugadores y Líderes", icon: Users },
  ];

  async function handleManualSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/cron/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSyncStatus(data.error || "Error al sincronizar");
      } else {
        setSyncStatus(
          `${data.counts?.teams ?? 0} equipos · ${data.counts?.games ?? 0} juegos sincronizados`
        );
        router.refresh();
      }
    } catch {
      setSyncStatus("Error de conexión");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/90 bg-[#FAF6F0]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-800 text-amber-50 shadow-sm group-hover:bg-amber-900 transition">
              <span className="font-serif text-lg font-bold tracking-tight">LMP</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl font-bold tracking-tight text-stone-900">
                  El Cuaderno del Pacífico
                </span>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 border border-amber-300/60">
                  2026
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Análisis de duelos, pitcheo y proyecciones de carreras
              </p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 rounded-xl bg-[#F3EDE2] p-1 border border-stone-200/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/" || pathname.startsWith("/games")
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-white text-amber-900 shadow-xs border border-stone-200/70"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <Icon className="h-4 w-4 text-amber-800/80" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-2xs">
            <Database className="h-3.5 w-3.5 text-amber-700" />
            <span>{supabaseConfigured ? "Supabase" : "API en Vivo"}</span>
          </div>

          {allowManualSync && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-full border border-amber-800/20 bg-amber-800 px-3.5 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-900 disabled:opacity-50 transition cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Sincronizando..." : "Sincronizar BD"}</span>
            </button>
          )}

          {syncStatus && (
            <span className="text-xs font-medium text-stone-600 hidden sm:inline">
              {syncStatus}
            </span>
          )}
        </div>
      </div>

      {/* Mobile Navigation */}
      <nav className="flex md:hidden border-t border-stone-200/80 bg-[#F3EDE2]/70 px-4 py-2 gap-2 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/games")
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                isActive
                  ? "bg-white text-amber-900 shadow-2xs border border-stone-200"
                  : "text-stone-600"
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-amber-800" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
