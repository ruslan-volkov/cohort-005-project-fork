// PROTOTYPE (prototype/notification-ui, never merged).
// Question: "How notifications look and behave in the UI" (wayfinder ticket #7).
// Three variants of the notification UI, mounted in the real app shell,
// switchable via ?variant=A|B|C (remembered in localStorage across navigation).
// In-memory only: no Knock, no DB. Reloading the page resets the feed.
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";
import { UserRole } from "~/db/schema";

export type NotificationKind =
  | "new-question"
  | "reply"
  | "refund-decided"
  | "new-refund-request"
  | "seat-claimed";

export interface ProtoNotification {
  id: number;
  kind: NotificationKind;
  /** Group key while Unread (lesson / top-level comment / Team Licence); null = never grouped. */
  groupKey: string | null;
  actors: string[];
  count: number;
  where: string;
  href: string;
  createdAt: number;
  read: boolean;
  extra?: string;
}

export function describe(n: ProtoNotification): string {
  const who =
    n.actors.length === 1
      ? n.actors[0]
      : n.actors.length === 2
        ? `${n.actors[0]} and ${n.actors[1]}`
        : `${n.actors[0]} and ${n.actors.length - 1} others`;
  switch (n.kind) {
    case "new-question":
      return n.count === 1
        ? `${who} asked a question on ${n.where}`
        : `${n.count} new questions on ${n.where} from ${who}`;
    case "reply":
      return n.count === 1
        ? `${who} replied to your comment on ${n.where}`
        : `${n.count} new replies to your comment on ${n.where}`;
    case "refund-decided":
      return `Your Refund Request for ${n.where} was ${n.extra}`;
    case "new-refund-request":
      return `${who} requested a refund for ${n.where}`;
    case "seat-claimed":
      return n.count === 1
        ? `${who} claimed a Seat on ${n.where}`
        : `${n.count} Seats claimed on ${n.where}`;
  }
}

const MIN = 60_000;
let nextId = 1000;

type Audience = "instructor" | "student" | "admin" | "team-admin";

function seed(audience: Audience): ProtoNotification[] {
  const now = Date.now();
  const mk = (p: Omit<ProtoNotification, "id">): ProtoNotification => ({ id: nextId++, ...p });
  switch (audience) {
    case "instructor":
      return [
        mk({ kind: "new-question", groupKey: "lesson-4", actors: ["Emma Wilson", "James Park", "Ava Nakamura"], count: 3, where: "Primitive Types", href: "/instructor/questions?lesson=4", createdAt: now - 4 * MIN, read: false }),
        mk({ kind: "new-question", groupKey: "lesson-2", actors: ["Olivia Martinez"], count: 1, where: "Installing and Configuring TypeScript", href: "/instructor/questions?lesson=2", createdAt: now - 95 * MIN, read: false }),
        mk({ kind: "reply", groupKey: "comment-12", actors: ["Liam Thompson"], count: 1, where: "What is TypeScript?", href: "/courses/introduction-to-typescript/lessons/1#comment-12", createdAt: now - 26 * 60 * MIN, read: true }),
        mk({ kind: "new-question", groupKey: "lesson-1", actors: ["Sophia Davis", "Noah Blackwood"], count: 2, where: "What is TypeScript?", href: "/instructor/questions?lesson=1", createdAt: now - 3 * 24 * 60 * MIN, read: true }),
      ];
    case "student":
    case "team-admin": {
      const base = [
        mk({ kind: "reply", groupKey: "comment-7", actors: ["Sarah Chen"], count: 1, where: "Primitive Types", href: "/courses/introduction-to-typescript/lessons/4#comment-7", createdAt: now - 12 * MIN, read: false }),
        mk({ kind: "refund-decided", groupKey: null, actors: [], count: 1, where: "Advanced React Patterns", extra: "approved", href: "/courses/introduction-to-typescript", createdAt: now - 2 * 24 * 60 * MIN, read: true }),
      ];
      if (audience === "team-admin") {
        base.unshift(
          mk({ kind: "seat-claimed", groupKey: "licence-3", actors: ["Ava Nakamura", "Noah Blackwood", "Liam Thompson", "Sophia Davis"], count: 4, where: "Introduction to TypeScript", href: "/team", createdAt: now - 30 * MIN, read: false }),
        );
      }
      return base;
    }
    case "admin":
      return [
        mk({ kind: "new-refund-request", groupKey: null, actors: ["James Park"], count: 1, where: "Introduction to TypeScript", href: "/admin/refunds", createdAt: now - 7 * MIN, read: false }),
        mk({ kind: "new-refund-request", groupKey: null, actors: ["Emma Wilson"], count: 1, where: "Advanced React Patterns", href: "/admin/refunds", createdAt: now - 50 * MIN, read: false }),
        mk({ kind: "new-refund-request", groupKey: null, actors: ["Olivia Martinez"], count: 1, where: "Introduction to TypeScript", href: "/admin/refunds", createdAt: now - 4 * 24 * 60 * MIN, read: true }),
      ];
  }
}

const arrivals: Record<Audience, Omit<ProtoNotification, "id" | "createdAt" | "read" | "count">[]> = {
  instructor: [
    { kind: "new-question", groupKey: "lesson-4", actors: ["Bossy McBossface"], where: "Primitive Types", href: "/instructor/questions?lesson=4" },
    { kind: "new-question", groupKey: "lesson-3", actors: ["Liam Thompson"], where: "Your First TypeScript Program", href: "/instructor/questions?lesson=3" },
  ],
  student: [
    { kind: "reply", groupKey: "comment-7", actors: ["James Park"], where: "Primitive Types", href: "/courses/introduction-to-typescript/lessons/4#comment-7" },
    { kind: "refund-decided", groupKey: null, actors: [], where: "Introduction to TypeScript", extra: "rejected", href: "/courses/introduction-to-typescript" },
  ],
  "team-admin": [
    { kind: "seat-claimed", groupKey: "licence-3", actors: ["Emma Wilson"], where: "Introduction to TypeScript", href: "/team" },
    { kind: "reply", groupKey: "comment-7", actors: ["James Park"], where: "Primitive Types", href: "/courses/introduction-to-typescript/lessons/4#comment-7" },
  ],
  admin: [
    { kind: "new-refund-request", groupKey: null, actors: ["Sophia Davis"], where: "Advanced React Patterns", href: "/admin/refunds" },
  ],
};

interface Store {
  audience: Audience;
  items: ProtoNotification[];
  unread: number;
  /** id of the last live arrival, so variants can react to it */
  lastArrival: { id: number; at: number } | null;
  open: (id: number) => void;
  markAllRead: () => void;
  simulateArrival: () => void;
  variant: string;
  setVariant: (v: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function useNotificationsProto() {
  const s = useContext(Ctx);
  if (!s) throw new Error("NotificationsProtoProvider missing");
  return s;
}

export function NotificationsProtoProvider({
  role,
  isTeamAdmin,
  children,
}: {
  role: UserRole | null;
  isTeamAdmin: boolean;
  children: React.ReactNode;
}) {
  const audience: Audience =
    role === UserRole.Admin
      ? "admin"
      : role === UserRole.Instructor
        ? "instructor"
        : isTeamAdmin
          ? "team-admin"
          : "student";

  const [items, setItems] = useState(() => seed(audience));
  const [lastArrival, setLastArrival] = useState<Store["lastArrival"]>(null);
  const [arrivalIdx, setArrivalIdx] = useState(0);

  useEffect(() => {
    setItems(seed(audience));
    setLastArrival(null);
  }, [audience]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [storedVariant, setStoredVariant] = useState("A");
  useEffect(() => {
    const s = localStorage.getItem("notif-proto-variant");
    if (s) setStoredVariant(s);
  }, []);
  const variant = searchParams.get("variant") ?? storedVariant;
  const setVariant = useCallback(
    (v: string) => {
      localStorage.setItem("notif-proto-variant", v);
      setStoredVariant(v);
      const next = new URLSearchParams(searchParams);
      next.set("variant", v);
      setSearchParams(next, { replace: true, preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  const open = useCallback((id: number) => {
    setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);
  const markAllRead = useCallback(() => {
    setItems((xs) => xs.map((n) => ({ ...n, read: true })));
  }, []);

  const simulateArrival = useCallback(() => {
    const pool = arrivals[audience];
    const a = pool[arrivalIdx % pool.length];
    setArrivalIdx((i) => i + 1);
    setItems((xs) => {
      // Grouping rule: join an Unread Notification with the same group key; otherwise start a new one.
      const existing = a.groupKey ? xs.find((n) => !n.read && n.groupKey === a.groupKey) : undefined;
      if (existing) {
        const merged: ProtoNotification = {
          ...existing,
          count: existing.count + 1,
          actors: [...a.actors, ...existing.actors.filter((x) => !a.actors.includes(x))],
          createdAt: Date.now(),
        };
        setLastArrival({ id: merged.id, at: Date.now() });
        return [merged, ...xs.filter((n) => n.id !== existing.id)];
      }
      const fresh: ProtoNotification = { ...a, id: nextId++, count: 1, createdAt: Date.now(), read: false };
      setLastArrival({ id: fresh.id, at: Date.now() });
      return [fresh, ...xs];
    });
  }, [audience, arrivalIdx]);

  const unread = items.filter((n) => !n.read).length;

  return (
    <Ctx.Provider
      value={{ audience, items, unread, lastArrival, open, markAllRead, simulateArrival, variant, setVariant }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function timeAgo(t: number) {
  const m = Math.round((Date.now() - t) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
