import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MessageSquare, TrendingUp, Activity, Calendar, Clock } from "lucide-react";

type Mensagem = {
  id: number;
  created_at: string;
};

export default function Index() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("historico_mensagem")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!mounted) return;
      setMensagens((data ?? []) as Mensagem[]);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("historico_mensagem_rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "historico_mensagem" },
        (payload) => {
          setMensagens((prev) => [payload.new as Mensagem, ...prev].slice(0, 1000));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const hojeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ontemStart = new Date(hojeStart.getTime() - 86400000);
    const semanaStart = new Date(hojeStart.getTime() - 7 * 86400000);
    const hoje = mensagens.filter((m) => new Date(m.created_at) >= hojeStart).length;
    const ontem = mensagens.filter((m) => {
      const d = new Date(m.created_at);
      return d >= ontemStart && d < hojeStart;
    }).length;
    const semana = mensagens.filter((m) => new Date(m.created_at) >= semanaStart).length;
    const variacao = ontem === 0 ? (hoje > 0 ? 100 : 0) : ((hoje - ontem) / ontem) * 100;
    return { hoje, ontem, semana, total: mensagens.length, variacao };
  }, [mensagens]);

  const dadosDiarios = useMemo(() => {
    const map = new Map<string, { dia: string; mensagens: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, {
        dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        mensagens: 0,
      });
    }
    mensagens.forEach((m) => {
      const key = new Date(m.created_at).toISOString().slice(0, 10);
      const row = map.get(key);
      if (!row) return;
      row.mensagens++;
    });
    return Array.from(map.values());
  }, [mensagens]);

  const dadosHorarios = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({
      hora: `${h.toString().padStart(2, "0")}h`,
      mensagens: 0,
    }));
    const dia = new Date();
    dia.setHours(0, 0, 0, 0);
    mensagens.forEach((m) => {
      const d = new Date(m.created_at);
      if (d >= dia) arr[d.getHours()].mensagens++;
    });
    return arr;
  }, [mensagens]);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10">
          <div className="mb-2 flex items-center gap-2">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Ao vivo
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Dashboard WhatsApp
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Métricas em tempo real do histórico de mensagens.
          </p>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-card" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={<MessageSquare className="h-5 w-5" />} label="Mensagens hoje" value={stats.hoje} trend={stats.variacao} accent />
              <StatCard icon={<Calendar className="h-5 w-5" />} label="Mensagens ontem" value={stats.ontem} />
              <StatCard icon={<Clock className="h-5 w-5" />} label="Últimos 7 dias" value={stats.semana} />
              <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Total (últ. 1000)" value={stats.total} />
            </div>

            <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <ChartCard title="Mensagens por dia" subtitle="Últimos 14 dias" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dadosDiarios}>
                    <defs>
                      <linearGradient id="grad-msg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipContent />} />
                    <Area type="monotone" dataKey="mensagens" stroke="var(--color-primary)" strokeWidth={2} fill="url(#grad-msg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Atividade hoje" subtitle="Por hora do dia">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dadosHorarios}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="hora" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={2} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipContent />} />
                    <Bar dataKey="mensagens" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section className="mt-8">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Mensagens recentes</h3>
                    <p className="text-xs text-muted-foreground">Atualiza em tempo real</p>
                  </div>
                  <Activity className="h-4 w-4 text-primary live-dot" />
                </div>
                <div className="divide-y divide-border">
                  {mensagens.slice(0, 15).map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <MessageSquare className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="h-3 w-24 rounded bg-muted-foreground/20" aria-label="Nome censurado" />
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <span className="mt-1.5 block h-2.5 w-3/4 rounded bg-muted-foreground/15" aria-label="Mensagem censurada" />
                      </div>
                    </div>
                  ))}
                  {mensagens.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, accent }: { icon: React.ReactNode; label: string; value: number; trend?: number; accent?: boolean; }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border p-6 shadow-[var(--shadow-card)]" style={{ background: "var(--gradient-card)" }}>
      {accent && <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-30 blur-3xl" style={{ background: "var(--gradient-primary)" }} />}
      <div className="relative flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      </div>
      <div className="relative mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight">{value.toLocaleString("pt-BR")}</span>
        {trend !== undefined && (
          <span className={`text-xs font-medium ${trend >= 0 ? "text-primary" : "text-destructive"}`}>
            {trend >= 0 ? "+" : ""}{trend.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; }) {
  return (
    <div className={`rounded-2xl border border-border p-6 shadow-[var(--shadow-card)] ${className}`} style={{ background: "var(--gradient-card)" }}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function TooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 capitalize" style={{ color: p.color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.dataKey}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}
