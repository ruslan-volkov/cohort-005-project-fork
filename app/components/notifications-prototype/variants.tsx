// PROTOTYPE (prototype/notification-ui, never merged). See store.tsx for the question.
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  MessageSquare,
  Reply,
  Receipt,
  UsersRound,
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  describe,
  timeAgo,
  useNotificationsProto,
  type ProtoNotification,
} from "./store";

export const VARIANTS = [
  { key: "A", name: "Bell + popover (Knock prebuilt look)" },
  { key: "B", name: "Feed page only, sidebar count" },
  { key: "C", name: "Bell + side panel + toasts, and a feed page" },
] as const;

function KindIcon({ n }: { n: ProtoNotification }) {
  const cls = "size-4";
  switch (n.kind) {
    case "new-question":
      return <MessageSquare className={cls} />;
    case "reply":
      return <Reply className={cls} />;
    case "refund-decided":
    case "new-refund-request":
      return <Receipt className={cls} />;
    case "seat-claimed":
      return <UsersRound className={cls} />;
  }
}

function useOpenNotification() {
  const { open } = useNotificationsProto();
  const navigate = useNavigate();
  return (n: ProtoNotification, after?: () => void) => {
    open(n.id);
    after?.();
    navigate(n.href);
  };
}

function Row({
  n,
  onOpen,
  dense,
}: {
  n: ProtoNotification;
  onOpen: () => void;
  dense?: boolean;
}) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 text-left transition-colors hover:bg-accent",
        dense ? "px-3 py-2" : "px-4 py-3",
        !n.read && "bg-primary/5",
      )}
    >
      <span className="mt-0.5 text-muted-foreground">
        <KindIcon n={n} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", !n.read ? "font-semibold" : "text-muted-foreground")}>
          {describe(n)}
        </span>
        <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
      </span>
      {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, close]);
  return ref;
}

/* ───────── Variant A: bell in the sidebar header, popover dropdown, Knock's prebuilt look ─────────
   Live arrival: the badge count changes, nothing else. No feed page. */
function VariantASidebar() {
  const { items, unread, markAllRead } = useNotificationsProto();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const openN = useOpenNotification();
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
      >
        <Bell className="size-4" />
        <Badge count={unread} className="absolute -right-1 -top-1" />
      </button>
      {open && (
        <div className="fixed left-56 top-2 z-50 ml-2 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Mark all as read
            </button>
          </div>
          <div className="flex-1 divide-y overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet</p>
            ) : (
              items.map((n) => <Row key={n.id} n={n} onOpen={() => openN(n, () => setOpen(false))} />)
            )}
          </div>
          {/* Free plan can't remove this footer from Knock's prebuilt feed. */}
          <div className="border-t bg-muted/50 py-2 text-center text-xs text-muted-foreground">
            Powered by Knock
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Variant B: no bell. A "Notifications" sidebar item with an unread count, opening a full
   Notification Feed page. Live arrival: a toast with "Open". */
function VariantBNav() {
  const { unread } = useNotificationsProto();
  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )
      }
    >
      <Bell className="size-4" />
      <span className="flex-1">Notifications</span>
      {unread > 0 && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          {unread}
        </span>
      )}
    </NavLink>
  );
}

/* ───────── Variant C: bell opens a right-hand side panel (own UI on Knock's headless hooks, no footer),
   split into Unread / Earlier, with "See all" to the feed page. Live arrival: bell rings + toast
   when the panel is closed, a "new" flash in place when it's open. */
function VariantCSidebar() {
  const { items, unread, markAllRead, lastArrival } = useNotificationsProto();
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const openN = useOpenNotification();
  useEffect(() => {
    if (!lastArrival) return;
    setRing(true);
    const t = setTimeout(() => setRing(false), 1200);
    return () => clearTimeout(t);
  }, [lastArrival]);
  const unreadItems = items.filter((n) => !n.read);
  const readItems = items.filter((n) => n.read);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
      >
        <Bell className={cn("size-4", ring && "animate-bounce text-primary")} />
        {unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-red-600" />}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setOpen(false)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[420px] flex-col border-l bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-lg font-semibold">Notifications</div>
                <div className="text-xs text-muted-foreground">{unread} unread</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={markAllRead} title="Mark all as read" className="rounded p-1.5 hover:bg-accent">
                  <CheckCheck className="size-4" />
                </button>
                <button onClick={() => setOpen(false)} className="rounded p-1.5 hover:bg-accent">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Section title="Unread" items={unreadItems} highlight={lastArrival?.id} onOpen={(n) => openN(n, () => setOpen(false))} />
              <Section title="Earlier" items={readItems} onOpen={(n) => openN(n, () => setOpen(false))} />
              {items.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
              )}
            </div>
            <NavLink
              to="/notifications"
              onClick={() => setOpen(false)}
              className="border-t px-5 py-3 text-center text-sm font-medium text-primary hover:bg-accent"
            >
              See all notifications
            </NavLink>
          </aside>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  items,
  onOpen,
  highlight,
}: {
  title: string;
  items: ProtoNotification[];
  onOpen: (n: ProtoNotification) => void;
  highlight?: number;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="divide-y">
        {items.map((n) => (
          <div key={`${n.id}-${n.count}`} className={cn(n.id === highlight && "animate-pulse")}>
            <Row n={n} onOpen={() => onOpen(n)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mounted next to the "Cadence" wordmark in the sidebar header (A, C). */
export function NotificationsHeaderSlot() {
  const { variant } = useNotificationsProto();
  if (variant === "A") return <VariantASidebar />;
  if (variant === "C") return <VariantCSidebar />;
  return null;
}

/** Mounted at the top of the sidebar nav (B). */
export function NotificationsNavSlot() {
  const { variant } = useNotificationsProto();
  return variant === "B" ? <VariantBNav /> : null;
}

/** Toasts on live arrival, for the variants that use them (B always, C when the panel isn't the focus). */
export function LiveArrivalToasts() {
  const { lastArrival, items, variant } = useNotificationsProto();
  const openN = useOpenNotification();
  useEffect(() => {
    if (!lastArrival || variant === "A") return;
    const n = items.find((x) => x.id === lastArrival.id);
    if (!n) return;
    toast(describe(n), {
      icon: <Bell className="size-4" />,
      action: { label: "Open", onClick: () => openN(n) },
      duration: 6000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastArrival]);
  return null;
}

/** The full Notification Feed page body (/notifications), used by B and C. */
export function NotificationFeedPage() {
  const { items, unread, markAllRead, variant } = useNotificationsProto();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const openN = useOpenNotification();
  const shown = filter === "unread" ? items.filter((n) => !n.read) : items;
  return (
    <div className="mx-auto max-w-2xl p-8">
      {variant === "A" && (
        <p className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          Variant A has no feed page; this page only exists for B and C.
        </p>
      )}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Kept for 90 days. {unread} unread.</p>
        </div>
        <button
          onClick={markAllRead}
          className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <CheckCheck className="size-4" /> Mark all as read
        </button>
      </div>
      <div className="mb-3 flex gap-1">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize",
              filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="divide-y overflow-hidden rounded-lg border">
        {shown.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          shown.map((n) => <Row key={n.id} n={n} onOpen={() => openN(n)} />)
        )}
      </div>
    </div>
  );
}

/* ───────── Floating switcher (dev only) ───────── */
export function PrototypeSwitcher() {
  const { variant, setVariant, simulateArrival, audience, unread } = useNotificationsProto();
  const idx = Math.max(0, VARIANTS.findIndex((v) => v.key === variant));
  const go = (d: number) => setVariant(VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-3 py-2 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-64 text-center">
        <b>{VARIANTS[idx].key}</b> ({VARIANTS[idx].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronRight className="size-4" />
      </button>
      <span className="mx-1 h-5 w-px bg-white/20" />
      <button
        onClick={simulateArrival}
        className="flex items-center gap-1 rounded-full bg-fuchsia-600 px-3 py-1 hover:bg-fuchsia-500"
        title="Simulate a live arrival for the current user's role"
      >
        <Zap className="size-3.5" /> Simulate arrival
      </button>
      <span className="text-xs text-white/60">
        as {audience} · {unread} unread
      </span>
    </div>
  );
}
