// The app's sidebar: the "Dashboard Sidebar" component (21st.dev, see components/ui/dashboard-sidebar.tsx) filled with
// LevelUp Life's pages, the player's name and level, and red dots for things waiting. The app itself is plain JavaScript
// (web/app.js); it tells this file what to show through a "lu:shell" event (and window.__luShell for the first paint),
// and hears back through "lu:search" (open the search) and "lu:action" (log out, sign in). Pages are ordinary #links.
import { useEffect, useState, type ElementType } from "react"
import { createRoot } from "react-dom/client"
import {
  Award, CircleHelp, Gamepad2, GraduationCap, HeartHandshake, LayoutDashboard, LogIn, LogOut, Mail, MessagesSquare,
  MonitorPlay, Scale, Search, Settings, Timer, Tv, UserRound, Users, Youtube,
} from "lucide-react"
import { SidebarNav, type NavGroupData, type NavItemData } from "@/components/ui/dashboard-sidebar"
import css from "./app-shell.css?inline"

type Route = { id: string; name: string; short?: string }
type Dot = { on: boolean; title?: string; count?: number }
export type ShellState = {
  current: string
  routes: Route[]
  user: { name: string; sub: string; avatarHtml: string; signedIn: boolean }
  dots: Record<string, Dot>
}
declare global { interface Window { __luShell?: ShellState } }

const ICONS: Record<string, ElementType> = {
  home: LayoutDashboard, study: GraduationCap, focus: Timer, gaming: Gamepad2, chat: MessagesSquare,
  series: Tv, youtube: Youtube, companion: MonitorPlay, balance: Scale,
  messages: Mail, players: Users, impact: HeartHandshake, badges: Award,
  options: Settings, help: CircleHelp,
}
const GROUPS: { heading?: string; ids: string[] }[] = [
  { ids: ["home", "study", "focus", "gaming", "chat"] },
  { heading: "Track", ids: ["series", "youtube", "companion", "balance"] },
  { heading: "Community", ids: ["messages", "players", "impact"] },
  { heading: "You", ids: ["badges"] },
]
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

function LevelUpSidebar() {
  const [s, setS] = useState<ShellState | undefined>(window.__luShell)
  useEffect(() => {
    const on = (e: Event) => setS({ ...(e as CustomEvent<ShellState>).detail })
    window.addEventListener("lu:shell", on)
    if (window.__luShell) setS({ ...window.__luShell })
    return () => window.removeEventListener("lu:shell", on)
  }, [])
  if (!s) return null

  const byId = new Map(s.routes.map(r => [r.id, r]))
  const item = (id: string): NavItemData | null => {
    const r = byId.get(id); if (!r) return null
    const d = s.dots[id]
    return {
      id, title: r.short || r.name, icon: ICONS[id] || LayoutDashboard, href: "#" + id,
      dot: !!d?.on && !d.count, dotTitle: d?.on ? d.title : undefined, badge: d?.on && d.count ? d.count : undefined,
    }
  }
  const groups: NavGroupData[] = GROUPS.map((g, i) => ({
    heading: g.heading,
    items: [
      ...(i === 0 ? [{ id: "search", title: "Search", icon: Search, shortcut: isMac ? "⌘K" : "Ctrl K" } as NavItemData] : []),
      ...g.ids.map(item).filter((x): x is NavItemData => !!x),
    ],
  })).filter(g => g.items.length)
  const bottom: NavItemData[] = [
    item("options"), item("help"),
    s.user.signedIn ? { id: "logout", title: "Log out", icon: LogOut } : { id: "signin", title: "Sign in", icon: LogIn },
  ].filter((x): x is NavItemData => !!x)

  const select = (id: string) => {
    if (id === "search") window.dispatchEvent(new CustomEvent("lu:search"))
    else if (id === "logout" || id === "signin") window.dispatchEvent(new CustomEvent("lu:action", { detail: id }))
  }

  return (
    <SidebarNav
      className="w-full border-none bg-transparent"
      navId="nav"
      activeId={s.current}
      onSelect={select}
      groups={groups}
      bottomItems={bottom}
      activeWorkspace={s.user.name}
      workspaces={[s.user.name]}
      onWorkspaceSelect={() => { location.hash = "#badges" }}
      workspaceSubtitle={s.user.sub}
      workspaceAvatar={<span className="lu-av w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: s.user.avatarHtml }} />}
      workspaceActions={[
        { id: "profile", title: "Profile & badges", icon: UserRound, href: "#badges" },
        { id: "settings", title: "Settings", icon: Settings, href: "#options" },
        s.user.signedIn ? { id: "logout", title: "Log out", icon: LogOut } : { id: "signin", title: "Sign in or create account", icon: LogIn },
      ]}
      onWorkspaceAction={id => { if (id === "logout" || id === "signin") select(id) }}
    />
  )
}

function mount() {
  const host = document.getElementById("sideRoot"); if (!host) return
  const style = document.createElement("style"); style.textContent = css; document.head.append(style)
  createRoot(host).render(<LevelUpSidebar />)
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount)
else mount()
