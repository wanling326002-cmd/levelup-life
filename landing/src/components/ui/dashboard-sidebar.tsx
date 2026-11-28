// "Dashboard Sidebar" by Arun Dass (https://21st.dev/@arunjdass/components/dashboard-sidebar), added from 21st.dev.
// Kept as published, with these additions for LevelUp Life (the original example data stays the default):
// - SidebarNav takes the menu, the bottom items and the switcher's entries as props (`groups`, `bottomItems`, `workspaces`,
//   `workspaceSubtitle`, `workspaceAvatar`, `workspaceActions`), so the app can show its own pages, profile and level
// - menu entries are real links (`href`) or buttons, so they work with the keyboard and screen readers; the open/closed
//   state of a group is announced (aria-expanded), the current page is marked (aria-current)
// - an entry can show a red dot (`dot`, with `dotTitle`), and a group opens by itself when one of its pages is current
// - `navId` names the scrolling menu (the app's guided tour points at it)
import React, { useEffect, useState } from 'react';
import {
  Search,
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  LogOut,
  Hash,
  ChevronDown,
  ChevronRight,
  Inbox,
  Calendar,
  Activity,
  CreditCard,
  Globe,
  Terminal,
  Blocks,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
  X
} from 'lucide-react';

export type NavItemData = {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: number | string;
  shortcut?: string;
  children?: NavItemData[];
  /** where the entry leads (a link); without it the entry is a button that calls onSelect */
  href?: string;
  /** a small red dot, for something waiting there */
  dot?: boolean;
  dotTitle?: string;
};

export type NavGroupData = {
  heading?: string;
  items: NavItemData[];
};

export type WorkspaceAction = { id: string; title: string; icon?: React.ElementType; href?: string };

const mockNavGroups: NavGroupData[] = [
  {
    items: [
      { id: 'search', title: 'Search', icon: Search, shortcut: '⌘K' },
      { id: 'home', title: 'Home', icon: LayoutDashboard },
      { id: 'inbox', title: 'Inbox', icon: Inbox, badge: 12 },
      { id: 'analytics', title: 'Analytics', icon: Activity },
    ]
  },
  {
    heading: 'Workspace',
    items: [
      {
        id: 'projects',
        title: 'Projects',
        icon: FolderKanban,
        children: [
          { id: 'p-active', title: 'Active', icon: Hash },
          { id: 'p-archived', title: 'Archived', icon: Hash },
        ]
      },
      { id: 'calendar', title: 'Calendar', icon: Calendar },
      {
        id: 'team',
        title: 'Team',
        icon: Users,
        children: [
          { id: 't-design', title: 'Designers', icon: Hash },
          { id: 't-eng', title: 'Engineering', icon: Hash },
          { id: 't-product', title: 'Product', icon: Hash },
        ]
      },
      {
        id: 'customers',
        title: 'Customers',
        icon: Globe,
        children: [
          { id: 'c-enterprise', title: 'Enterprise', icon: Hash },
          { id: 'c-smb', title: 'SMB', icon: Hash },
        ]
      },
      { id: 'finance', title: 'Finance', icon: CreditCard },
    ]
  },
  {
    heading: 'Developers',
    items: [
      { id: 'api', title: 'API Keys', icon: Terminal },
      { id: 'webhooks', title: 'Webhooks', icon: Blocks },
    ]
  }
];

const mockBottomItems: NavItemData[] = [
  { id: 'settings', title: 'Settings', icon: Settings, shortcut: '⌘,' },
  { id: 'logout', title: 'Log out', icon: LogOut },
];

function WorkspaceSwitcher({ selected, onSelect, options, subtitle, avatar, actions, onAction }: {
  selected?: string,
  onSelect?: (ws: string) => void,
  options?: string[],
  subtitle?: string,
  avatar?: React.ReactNode,
  actions?: WorkspaceAction[],
  onAction?: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState('Acme Corp');

  const current = selected || internalSelected;
  const handleSelect = onSelect || setInternalSelected;
  const list = options || ['Acme Corp', 'Personal Workspace', 'Client Sandbox'];

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2 py-2 mb-4 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none group text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-[6px] bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[13px] shadow-sm overflow-hidden shrink-0">
            {avatar || current.charAt(0)}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-[13px] font-medium leading-none mb-1 text-foreground truncate max-w-[150px]">{current}</span>
            <span className="text-[11px] text-muted-foreground leading-none truncate max-w-[150px]">{subtitle ?? 'Pro Plan'}</span>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors shrink-0" strokeWidth={1.5} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div role="menu" className="absolute top-[52px] left-0 w-full bg-card border border-border/50 rounded-lg shadow-xl z-50 py-1 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
            {list.map(ws => (
              <button
                type="button"
                role="menuitem"
                key={ws}
                onClick={() => { handleSelect(ws); setIsOpen(false); }}
                className={`px-3 py-2 mx-1 text-[13px] text-left rounded-md cursor-pointer transition-colors ${current === ws ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                {ws}
              </button>
            ))}
            <div className="h-px bg-border/50 my-1 mx-2" />
            {(actions || [{ id: 'create', title: 'Create Workspace' }]).map(a => {
              const inner = (<>{a.icon ? <a.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} /> : <span className="text-[16px] leading-none mb-0.5">+</span>} {a.title}</>);
              const cls = "px-3 py-2 mx-1 text-[13px] text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-md cursor-pointer flex items-center gap-2 transition-colors text-left";
              return a.href
                ? <a key={a.id} role="menuitem" href={a.href} className={cls} onClick={() => { onAction?.(a.id); setIsOpen(false); }}>{inner}</a>
                : <button key={a.id} type="button" role="menuitem" className={cls} onClick={() => { onAction?.(a.id); setIsOpen(false); }}>{inner}</button>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

const hasActive = (item: NavItemData, activeId: string): boolean =>
  item.id === activeId || !!item.children?.some(c => hasActive(c, activeId));
const hasDot = (item: NavItemData): boolean => !!item.dot || !!item.children?.some(hasDot);

function NavItem({
  item,
  activeId,
  onSelect,
  level = 0
}: {
  item: NavItemData;
  activeId: string;
  onSelect: (id: string) => void;
  level?: number;
}) {
  const isActive = activeId === item.id;
  const hasChildren = !!item.children;
  const childActive = hasChildren && hasActive(item, activeId);
  const [isOpen, setIsOpen] = useState(childActive);
  useEffect(() => { if (childActive) setIsOpen(true); }, [childActive]); // a group opens by itself when one of its pages is current

  const handleClick = (e: React.MouseEvent) => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    } else {
      if (!item.href) e.preventDefault();
      onSelect(item.id);
    }
  };

  const rowClass = `group flex w-full items-center justify-between pr-2.5 py-[7px] rounded-[6px] cursor-pointer transition-all duration-200 select-none text-left no-underline
          ${isActive || (childActive && !isOpen)
            ? 'active bg-black/5 dark:bg-white/10 text-foreground font-medium'
            : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90'
          }
          ${hasDot(item) && !(hasChildren && isOpen) ? 'has-req' : ''}
        `;
  const content = (
    <>
        <div className="flex items-center gap-2.5 min-w-0">
          <item.icon
            className={`w-[16px] h-[16px] shrink-0 transition-colors
              ${isActive ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground/70'}
            `}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-[13px] tracking-wide truncate">
            {item.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {item.shortcut && (
             <kbd className="hidden group-hover:inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-medium font-mono text-muted-foreground/60 bg-background/50 border border-border/50 rounded-[4px] shadow-xs">
               {item.shortcut}
             </kbd>
          )}
          {item.badge ? (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary">
              {item.badge}
            </span>
          ) : null}
          {hasDot(item) && !(hasChildren && isOpen) && (
            <span className="w-2 h-2 rounded-full bg-red-500" role="img" aria-label={item.dotTitle || 'Something new'} title={item.dotTitle} />
          )}
          {hasChildren && (
            <ChevronRight
              className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
              strokeWidth={2}
              aria-hidden="true"
            />
          )}
        </div>
    </>
  );
  const common = {
    className: rowClass,
    style: { paddingLeft: `${level * 12 + 10}px` },
    onClick: handleClick,
    'data-route': item.id,
    title: item.dotTitle || undefined,
  };

  return (
    <div className="flex flex-col w-full">
      {hasChildren ? (
        <button type="button" aria-expanded={isOpen} aria-controls={`nav-group-${item.id}`} {...common}>{content}</button>
      ) : item.href ? (
        <a href={item.href} aria-current={isActive ? 'page' : undefined} {...common}>{content}</a>
      ) : (
        <button type="button" {...common}>{content}</button>
      )}

      {hasChildren && (
        <div
          id={`nav-group-${item.id}`}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
          {...({ inert: !isOpen ? '' : undefined } as React.HTMLAttributes<HTMLDivElement>)} // closed groups can't be tabbed into
        >
          <div className="overflow-hidden min-h-0 relative flex flex-col gap-0.5 mt-0.5">
            <div
              className="absolute top-0 bottom-0 border-l border-black/5 dark:border-white/5"
              style={{ left: `${level * 12 + 17.5}px` }}
            />
            {item.children!.map(child => (
              <NavItem
                key={child.id}
                item={child}
                activeId={activeId}
                onSelect={onSelect}
                level={level + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({
  className = '',
  activeId,
  onSelect,
  activeWorkspace,
  onWorkspaceSelect,
  groups = mockNavGroups,
  bottomItems = mockBottomItems,
  workspaces,
  workspaceSubtitle,
  workspaceAvatar,
  workspaceActions,
  onWorkspaceAction,
  navId,
  navLabel = 'Main navigation'
}: {
  className?: string,
  activeId?: string,
  onSelect?: (id: string) => void,
  activeWorkspace?: string,
  onWorkspaceSelect?: (ws: string) => void,
  groups?: NavGroupData[],
  bottomItems?: NavItemData[],
  workspaces?: string[],
  workspaceSubtitle?: string,
  workspaceAvatar?: React.ReactNode,
  workspaceActions?: WorkspaceAction[],
  onWorkspaceAction?: (id: string) => void,
  navId?: string,
  navLabel?: string
}) {
  const [internalId, setInternalId] = useState('home');
  const currentId = activeId !== undefined ? activeId : internalId;
  const handleSelect = onSelect || setInternalId;

  return (
    <div className={`flex flex-col w-[260px] h-full bg-card/50 border-r border-border/50 p-3 font-sans ${className}`}>
      <WorkspaceSwitcher selected={activeWorkspace} onSelect={onWorkspaceSelect} options={workspaces} subtitle={workspaceSubtitle}
        avatar={workspaceAvatar} actions={workspaceActions} onAction={onWorkspaceAction} />

      <nav id={navId} aria-label={navLabel} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4 mt-2">
        {groups.map((group, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            {group.heading && (
              <span className="px-2.5 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
                {group.heading}
              </span>
            )}
            {group.items.map(item => (
              <NavItem
                key={item.id}
                item={item}
                activeId={currentId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t border-border/50 flex flex-col gap-0.5">
        {bottomItems.map(item => (
          <NavItem
            key={item.id}
            item={item}
            activeId={currentId}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}

const allItems = [...mockNavGroups.flatMap(g => g.items), ...mockBottomItems];
const flattenItems = (items: NavItemData[]): NavItemData[] => {
  return items.reduce((acc, item) => {
    acc.push(item);
    if (item.children) acc.push(...flattenItems(item.children));
    return acc;
  }, [] as NavItemData[]);
};
const flatMockData = flattenItems(allItems);

export default function SidebarNavPreview() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeId, setActiveId] = useState('home');
  const [activeWorkspace, setActiveWorkspace] = useState('Acme Corp');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const activeItem = flatMockData.find(i => i.id === activeId);
  const activeTitle = activeItem ? activeItem.title : 'Dashboard';

  const handleSelect = (id: string) => {
    if (id === 'search') {
      setIsSearchOpen(true);
      return;
    }
    setActiveId(id);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[700px] bg-background p-4 md:p-8">


      <div className="relative w-full max-w-4xl h-[700px] bg-card rounded-xl border border-border/50 flex overflow-hidden shadow-sm ring-1 ring-black/5 dark:ring-white/5">


        <div
          className={`h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden bg-card/50 border-r border-border/50 ${
            isOpen ? 'w-[260px] opacity-100' : 'w-0 opacity-0 border-none'
          }`}
        >

          <SidebarNav
            className="w-[260px] border-none bg-transparent"
            activeId={activeId}
            onSelect={handleSelect}
            activeWorkspace={activeWorkspace}
            onWorkspaceSelect={setActiveWorkspace}
          />
        </div>


        <div className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col min-w-0 transition-all duration-300">


           <div className="h-14 border-b border-border/50 flex items-center px-4 justify-between bg-card shrink-0">
             <div className="flex items-center gap-3">
               <button
                 onClick={() => setIsOpen(!isOpen)}
                 className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors"
               >
                 {isOpen ? <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} /> : <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />}
               </button>
               <div className="flex items-center gap-2 text-sm text-muted-foreground">
                 <span className="truncate">{activeWorkspace}</span>
                 <span>/</span>
                 <span className="font-medium text-foreground truncate">{activeTitle}</span>
               </div>
             </div>

             <div className="flex items-center gap-3">
               <div className="w-64 h-8 bg-black/5 dark:bg-white/5 rounded-md hidden md:block" />
               <div className="w-8 h-8 bg-primary/10 rounded-full border border-primary/20" />
             </div>
           </div>


           <div className="p-6 md:p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
             <div className="flex items-center justify-between mb-8">
               <div className="w-48 h-8 bg-black/5 dark:bg-white/5 rounded-md" />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
               <div className="h-32 bg-card rounded-xl border border-border/50 shadow-sm" />
               <div className="h-32 bg-card rounded-xl border border-border/50 shadow-sm" />
             </div>

             <div className="w-full bg-card rounded-xl border border-border/50 shadow-sm p-6">
                <div className="w-1/3 h-5 bg-black/5 dark:bg-white/5 rounded-md mb-6" />
                <div className="w-full h-[1px] bg-border/50 mb-6" />

                <div className="flex flex-col gap-4">
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded-lg" />
               </div>
             </div>
           </div>
        </div>


        {isSearchOpen && (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/40 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)} />
            <div className="relative w-full max-w-xl bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center px-4 border-b border-border/50">
                <Search className="w-[18px] h-[18px] text-muted-foreground/70 mr-3 shrink-0" strokeWidth={1.5} />
                <input
                  autoFocus
                  className="flex-1 bg-transparent py-4 outline-none text-[14px] text-foreground placeholder:text-muted-foreground/50"
                  placeholder="Search projects, docs, or actions..."
                />
                <kbd
                  onClick={() => setIsSearchOpen(false)}
                  className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 ml-2 text-[10px] font-medium font-mono text-muted-foreground/70 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-[4px] cursor-pointer hover:text-foreground hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                >
                  ESC
                </kbd>
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="ml-3 p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="w-[18px] h-[18px]" strokeWidth={1.5} />
                </button>
              </div>
              <div className="p-2 py-8 flex flex-col items-center justify-center">
                 <Command className="w-6 h-6 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
                 <p className="text-[13px] text-muted-foreground font-medium">Type a command or search...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
