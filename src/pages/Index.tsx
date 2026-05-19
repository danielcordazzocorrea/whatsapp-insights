import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Bot,
  Cpu,
  Filter,
  Gauge,
  Inbox,
  MessageSquare,
  Radio,
  Search,
  Server,
  Signal,
  Terminal,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

type Mensagem = {
  id: number;
  who_sent: string;
  mensagem: string | null;
  created_at: string;
};

const NAV = [
  { icon: Gauge, label: "Overview", active: true },
  { icon: Inbox, label: "Queue" },
  { icon: Terminal, label: "Live Stream" },
  { icon: Users, label: "Agents" },
  { icon: Signal, label: "SLA" },
  { icon: Server, label: "Webhooks" },
  { icon: AlertTriangle, label: "Incidents" },
  { icon: Radio, label: "Sessions" },
];

// Pseudo-random with seed for deterministic but messy data
const rnd = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

export default function Index() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState("");
  const newIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("historico_mensagem")
        .select("id, who_sent, mensagem, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!mounted) return;
      setMensagens((data ?? []) as Mensagem[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("hm_rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "historico_mensagem" },
        (payload) => {
          const m = payload.new as Mensagem;
          newIdsRef.current.add(m.id);
          setTimeout(() => newIdsRef.current.delete(m.id), 2000);
          setMensagens((prev) => [m, ...prev].slice(0, 1000));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const nowMs = Date.now();
    const last1m = mensagens.filter((m) => nowMs - +new Date(m.created_at) < 60_000).length;
    const last5m = mensagens.filter((m) => nowMs - +new Date(m.created_at) < 5 * 60_000).length;
    const last1h = mensagens.filter((m) => nowMs - +new Date(m.created_at) < 60 * 60_000).length;
    const today = mensagens.filter((m) => {
      const d = new Date(m.created_at);
      const s = new Date(); s.setHours(0,0,0,0);
      return d >= s;
    }).length;
    const bots = mensagens.filter((m) => m.who_sent === "bot").length;
    const clients = mensagens.length - bots;
    const ratio = mensagens.length ? Math.round((bots / mensagens.length) * 100) : 0;
    return { last1m, last5m, last1h, today, bots, clients, ratio, total: mensagens.length };
  }, [mensagens, now]);

  // Throughput per minute (last 30 min)
  const throughput = useMemo(() => {
    const buckets: { t: string; msg: number; bot: number; cli: number }[] = [];
    const base = new Date();
    base.setSeconds(0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 60_000);
      buckets.push({
        t: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        msg: 0, bot: 0, cli: 0,
      });
    }
    const startMs = base.getTime() - 29 * 60_000;
    mensagens.forEach((m) => {
      const ms = +new Date(m.created_at);
      if (ms < startMs) return;
      const idx = Math.floor((ms - startMs) / 60_000);
      if (idx < 0 || idx >= 30) return;
      buckets[idx].msg++;
      if (m.who_sent === "bot") buckets[idx].bot++; else buckets[idx].cli++;
    });
    return buckets;
  }, [mensagens, now]);

  // SLA distribution (synthetic but seeded by total)
  const slaSeries = useMemo(() => {
    const r = rnd(mensagens.length + 17);
    return Array.from({ length: 24 }, (_, h) => ({
      h: `${h.toString().padStart(2, "0")}`,
      p50: Math.round(800 + r() * 600),
      p95: Math.round(1800 + r() * 2200),
      p99: Math.round(3200 + r() * 4800),
    }));
  }, [mensagens.length]);

  // Synthetic agents
  const agents = useMemo(() => {
    const names = ["Bot-Alpha", "Bot-Bravo", "Bot-Charlie", "Op-Daniel", "Op-Eva", "Op-Felix"];
    const r = rnd(mensagens.length + 3);
    return names.map((n, i) => {
      const load = Math.round(20 + r() * 80);
      const states = ["online", "online", "online", "busy", "degraded", "idle"] as const;
      const state = states[i % states.length];
      return {
        id: `AG-${(1000 + i).toString()}`,
        name: n,
        state,
        load,
        active: Math.round(r() * 18),
        handled: Math.round(50 + r() * 400),
      };
    });
  }, [mensagens.length]);

  // Webhook / system health
  const systems = useMemo(() => {
    const r = rnd(mensagens.length + 99);
    return [
      { name: "wa-webhook-ingress", state: "ok",   lat: Math.round(40 + r() * 60), uptime: "99.982%" },
      { name: "session-broker",     state: "ok",   lat: Math.round(8 + r() * 22),  uptime: "99.997%" },
      { name: "delivery-worker-01", state: "warn", lat: Math.round(220 + r() * 400), uptime: "99.21%"  },
      { name: "delivery-worker-02", state: "ok",   lat: Math.round(60 + r() * 90), uptime: "99.95%" },
      { name: "media-relay",        state: "warn", lat: Math.round(180 + r() * 200), uptime: "98.7%"  },
      { name: "auth-proxy",         state: "ok",   lat: Math.round(10 + r() * 20), uptime: "99.999%" },
      { name: "history-replicator", state: "err",  lat: Math.round(1200 + r() * 800), uptime: "94.1%" },
    ] as const;
  }, [mensagens.length]);

  // Incidents feed (synthetic)
  const incidents = useMemo(() => {
    const items = [
      { level: "warn", code: "WBH-429", msg: "Webhook rate-limited by upstream (graph.facebook.com)", ago: "2m" },
      { level: "err",  code: "REPL-503", msg: "history-replicator: degraded — retrying batch #84221", ago: "6m" },
      { level: "info", code: "DEPLOY", msg: "delivery-worker rolled out v1.42.3 (canary 20%)", ago: "14m" },
      { level: "warn", code: "QUEUE", msg: "Queue p95 wait > 12s for VIP segment", ago: "23m" },
      { level: "ok",   code: "RECOVER", msg: "media-relay back to nominal after 3m11s", ago: "41m" },
      { level: "err",  code: "WS-1006", msg: "Socket dropped on shard-3, reconnecting…", ago: "1h" },
    ];
    return items;
  }, []);

  // Queue (synthetic, derived from recent client messages)
  const queue = useMemo(() => {
    const r = rnd(mensagens.length + 51);
    const recents = mensagens.filter(m => m.who_sent !== "bot").slice(0, 14);
    return recents.map((m, i) => {
      const prio = ["P0","P1","P2","P3"][Math.min(3, Math.floor(r()*4))];
      const wait = Math.round(r() * 240);
      return {
        id: `CV-${(82310 + m.id).toString(36).toUpperCase()}`,
        from: `+55 11 9${(Math.floor(r()*9000)+1000)}-${(Math.floor(r()*9000)+1000)}`,
        last: (m.mensagem || "(media)").slice(0, 60),
        prio, wait,
        at: new Date(m.created_at),
      };
    });
  }, [mensagens]);

  // Filtered stream
  const stream = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const arr = mensagens.slice(0, 200);
    if (!q) return arr;
    return arr.filter(m =>
      String(m.id).includes(q) ||
      (m.mensagem || "").toLowerCase().includes(q) ||
      (m.who_sent || "").toLowerCase().includes(q)
    );
  }, [mensagens, filter]);

  const msgsPerMin = throughput[throughput.length - 1]?.msg ?? 0;

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* TOP BAR */}
      <header className="flex items-center border-b border-border bg-[#0d1115]">
        <div className="flex items-center gap-2 px-4 py-2 border-r border-border min-w-[220px]">
          <div className="h-6 w-6 grid place-items-center border border-border bg-[#11161c]">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">WA · NOC</div>
            <div className="text-[12px] font-semibold">Mission Control</div>
          </div>
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-r border-border">
          <span className="flex items-center gap-2 text-[11px] mono uppercase tracking-wider text-muted-foreground">
            <span className="led blink" /> Live · WS shard-1
          </span>
          <span className="flex items-center gap-2 text-[11px] mono uppercase tracking-wider text-muted-foreground">
            <Wifi className="h-3 w-3" /> Ingress OK
          </span>
          <span className="flex items-center gap-2 text-[11px] mono uppercase tracking-wider text-warning">
            <AlertTriangle className="h-3 w-3" /> 2 Warnings
          </span>
        </div>
        <div className="flex-1 px-4 py-1.5 flex items-center gap-2 border-r border-border">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter: id, content, sender…"
            className="mono w-full bg-transparent text-[12px] placeholder:text-muted-foreground/60 focus:outline-none"
          />
        </div>
        <div className="px-4 py-2 mono text-[12px] text-foreground/90">
          {now.toLocaleString("pt-BR", { hour12: false })}
          <span className="text-muted-foreground"> UTC{(-now.getTimezoneOffset()/60).toString().padStart(2,"+0")}</span>
        </div>
      </header>

      {/* SHELL */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT NAV */}
        <nav className="w-[180px] shrink-0 border-r border-border bg-[#0c1014]">
          <div className="px-3 py-2 mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground border-b border-border">
            Modules
          </div>
          {NAV.map((n) => (
            <a key={n.label} href="#" className={`navitem ${n.active ? "active" : ""}`}>
              <n.icon className="h-3.5 w-3.5" /> {n.label}
            </a>
          ))}
          <div className="px-3 py-2 mt-4 mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground border-y border-border">
            Shards
          </div>
          {["shard-1","shard-2","shard-3","shard-4"].map((s, i) => (
            <div key={s} className="flex items-center justify-between px-3 py-1.5 text-[11px] mono">
              <span className="flex items-center gap-2"><span className={`led ${i===2?"err":i===1?"warn":""}`} />{s}</span>
              <span className="text-muted-foreground">{[412,318,0,289][i]}</span>
            </div>
          ))}
        </nav>

        {/* CENTER */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* KPI strip */}
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 border-b border-border">
            <Kpi label="MSG / MIN"  value={msgsPerMin} accent />
            <Kpi label="LAST 5 MIN" value={stats.last5m} />
            <Kpi label="LAST HOUR"  value={stats.last1h} />
            <Kpi label="TODAY"      value={stats.today} />
            <Kpi label="BOT RATIO"  value={`${stats.ratio}%`} sub={`${stats.bots} / ${stats.total}`} />
            <Kpi label="TOTAL (1k)" value={stats.total} sub="rolling window" />
          </section>

          {/* Charts row */}
          <section className="grid grid-cols-1 xl:grid-cols-3 border-b border-border">
            <Panel title="Throughput · msgs/min (last 30m)" right={<span className="tag ok">LIVE</span>} className="xl:col-span-2 border-r border-border">
              <div className="h-[200px] panel-body !p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={throughput} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="th" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#25D366" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#25D366" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1a2027" vertical={false} />
                    <XAxis dataKey="t" stroke="#5b6671" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                    <YAxis stroke="#5b6671" fontSize={10} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<TT />} />
                    <Area type="stepAfter" dataKey="msg" stroke="#25D366" strokeWidth={1.5} fill="url(#th)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="SLA latency · p50/p95/p99 (ms)" right={<span className="tag warn">P99 BREACH 2×</span>}>
              <div className="h-[200px] panel-body !p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={slaSeries} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#1a2027" vertical={false} />
                    <XAxis dataKey="h" stroke="#5b6671" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#5b6671" fontSize={10} tickLine={false} axisLine={false} width={32} />
                    <Tooltip content={<TT />} />
                    <Line type="monotone" dataKey="p50" stroke="#3aa6ff" strokeWidth={1.2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="p95" stroke="#f5a524" strokeWidth={1.2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="p99" stroke="#ff4d4f" strokeWidth={1.2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </section>

          {/* Live stream + queue */}
          <section className="grid grid-cols-1 xl:grid-cols-5 flex-1 min-h-0">
            <Panel
              title="Live message stream · /var/log/wa/stream.log"
              right={<span className="mono text-[10px] text-muted-foreground">{stream.length} rows</span>}
              className="xl:col-span-3 border-r border-border min-h-0 flex flex-col"
            >
              <div className="flex-1 overflow-auto thin-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-[90px]">TIME</th>
                      <th className="w-[70px]">DIR</th>
                      <th className="w-[90px]">SHARD</th>
                      <th>EVENT</th>
                      <th className="w-[80px] text-right">LATENCY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={5} className="mono text-muted-foreground py-3">connecting to stream…</td></tr>
                    )}
                    {!loading && stream.length === 0 && (
                      <tr><td colSpan={5} className="mono text-muted-foreground py-3">no events match filter</td></tr>
                    )}
                    {stream.map((m) => {
                      const bot = m.who_sent === "bot";
                      const isNew = newIdsRef.current.has(m.id);
                      const d = new Date(m.created_at);
                      const lat = 80 + (m.id % 540);
                      const latClass = lat > 400 ? "tag err" : lat > 200 ? "tag warn" : "tag ok";
                      return (
                        <tr key={m.id} className={isNew ? "row-new" : undefined}>
                          <td className="mono text-muted-foreground">
                            {d.toLocaleTimeString("pt-BR", { hour12: false })}
                            <span className="text-[9px] opacity-60">.{String(d.getMilliseconds()).padStart(3,"0")}</span>
                          </td>
                          <td>
                            <span className={`tag ${bot ? "info" : "ok"}`}>{bot ? "OUT" : "IN"}</span>
                          </td>
                          <td className="mono text-muted-foreground">shard-{(m.id % 4) + 1}</td>
                          <td className="mono">
                            <span className="text-muted-foreground">msg.id=</span>
                            <span className="text-foreground">{m.id}</span>
                            <span className="text-muted-foreground"> · </span>
                            <span className="text-foreground/90">{(m.mensagem || (bot ? "ack:delivered" : "(no body)")).slice(0, 80)}</span>
                          </td>
                          <td className="text-right"><span className={latClass}>{lat}ms</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Conversation queue · priority" right={<span className="tag warn">{queue.length} waiting</span>} className="xl:col-span-2 min-h-0 flex flex-col">
              <div className="flex-1 overflow-auto thin-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>FROM</th>
                      <th>PRIO</th>
                      <th className="text-right">WAIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.length === 0 && (
                      <tr><td colSpan={4} className="mono text-muted-foreground py-3">queue empty</td></tr>
                    )}
                    {queue.map((q) => {
                      const cls = q.prio === "P0" ? "tag err" : q.prio === "P1" ? "tag warn" : q.prio === "P2" ? "tag info" : "tag";
                      const waitCls = q.wait > 120 ? "text-destructive" : q.wait > 60 ? "text-warning" : "text-foreground";
                      return (
                        <tr key={q.id}>
                          <td className="mono text-foreground/90">{q.id}</td>
                          <td className="mono text-muted-foreground">{q.from}</td>
                          <td><span className={cls}>{q.prio}</span></td>
                          <td className={`mono text-right ${waitCls}`}>{q.wait}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>
        </main>

        {/* RIGHT MONITORING */}
        <aside className="w-[320px] shrink-0 border-l border-border bg-[#0c1014] flex flex-col">
          <Panel title="System health · webhooks">
            <div className="panel-body">
              {systems.map((s) => (
                <div key={s.name} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`led ${s.state === "warn" ? "warn" : s.state === "err" ? "err" : ""}`} />
                    <span className="mono text-[11px] truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`mono text-[11px] ${s.lat > 500 ? "text-destructive" : s.lat > 200 ? "text-warning" : "text-foreground/80"}`}>{s.lat}ms</span>
                    <span className="mono text-[10px] text-muted-foreground">{s.uptime}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Agents · workload">
            <div className="panel-body">
              {agents.map((a) => (
                <div key={a.id} className="py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px]">
                      <span className={`led ${a.state === "idle" ? "idle" : a.state === "degraded" ? "err" : a.state === "busy" ? "warn" : ""}`} />
                      {a.name}
                    </span>
                    <span className="mono text-[10px] text-muted-foreground">{a.handled}/d</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="bar-track flex-1">
                      <div
                        className={`bar-fill ${a.load > 85 ? "err" : a.load > 65 ? "warn" : ""}`}
                        style={{ width: `${a.load}%` }}
                      />
                    </div>
                    <span className="mono text-[10px] text-muted-foreground w-10 text-right">{a.load}%</span>
                  </div>
                  <div className="mt-0.5 flex justify-between mono text-[10px] text-muted-foreground">
                    <span>{a.id}</span><span>active: {a.active}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Incidents · last 24h" right={<span className="tag err">2 OPEN</span>} className="flex-1 min-h-0 flex flex-col">
            <div className="panel-body flex-1 overflow-auto thin-scroll">
              {incidents.map((i, idx) => {
                const cls = i.level === "err" ? "led err" : i.level === "warn" ? "led warn" : i.level === "ok" ? "led" : "led idle";
                return (
                  <div key={idx} className="py-2 border-b border-border last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className={cls} />
                        <span className="mono text-[11px] text-foreground/90">{i.code}</span>
                      </span>
                      <span className="mono text-[10px] text-muted-foreground">{i.ago} ago</span>
                    </div>
                    <p className="mt-1 text-[12px] text-foreground/80 leading-snug">{i.msg}</p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </aside>
      </div>

      {/* STATUS BAR */}
      <footer className="flex items-center justify-between border-t border-border bg-[#0d1115] px-3 py-1.5 mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><Cpu className="h-3 w-3" /> cpu 38%</span>
          <span className="flex items-center gap-1.5"><Activity className="h-3 w-3" /> mem 61%</span>
          <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-primary" /> evt-rate {msgsPerMin}/m</span>
          <span className="flex items-center gap-1.5"><Bot className="h-3 w-3" /> bot-ratio {stats.ratio}%</span>
        </div>
        <div className="flex items-center gap-4">
          <span>build 1.42.3</span>
          <span>region sa-east-1</span>
          <span className="flex items-center gap-1.5"><span className="led blink" /> connected</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function Kpi({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <div className="px-4 py-3 border-r border-border last:border-r-0">
      <div className="mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 mono text-[22px] leading-none ${accent ? "text-primary" : "text-foreground"}`}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {sub && <div className="mt-1 mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Panel({
  title, right, children, className = "",
}: {
  title: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`panel ${className}`}>
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function TT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel mono text-[11px] px-2 py-1.5">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5" style={{ background: p.color }} />
          <span className="text-muted-foreground uppercase tracking-wider">{p.dataKey}</span>
          <span className="ml-auto text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
