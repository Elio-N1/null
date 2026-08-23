import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chat, Delete, Plus } from 'react-iconly'
import type { Session } from '@supabase/supabase-js'
import AddTransactionModal from './components/AddTransactionModal'
import AccountTransferModal from './components/AccountTransferModal'
import BudgetPulse from './components/BudgetPulse'
import CategoryPanel from './components/CategoryPanel'
import ConfirmDialog from './components/ConfirmDialog'
import FinanceModule from './components/FinanceModule'
import FinancialSettings from './components/FinancialSettings'
import GeminiAssistant from './components/GeminiAssistant'
import { Glass } from './components/Glass'
import LedgerModule from './components/LedgerModule'
import ManagedModule from './components/ManagedModule'
import MobileNav from './components/MobileNav'
import NotificationDrawer from './components/NotificationDrawer'
import PlanModule from './components/PlanModule'
import ReportsModule from './components/ReportsModule'
import ReceiptScannerModal from './components/ReceiptScannerModal'
import Sidebar from './components/Sidebar'
import SubscriptionPanel from './components/SubscriptionPanel'
import Topbar, { type ThemeName } from './components/Topbar'
import Transactions from './components/Transactions'
import WorkspaceGate from './components/WorkspaceGate'
import InstallPrompt from './components/InstallPrompt'
import type { Transaction } from './data'
import { clearUserWorkspace, createTransaction, createUserWorkspace, deleteTransaction, deleteUserWorkspace, effectiveBudgetAllocation, effectiveMonthlyBudget, loadUserWorkspaces, loadWorkspaceSnapshot, markAllNotificationsRead, markNotificationRead, readWorkspaceCache, removeWorkspaceCache, saveExchangeRate, saveGeminiTransactionPreference, saveNotificationPreferences, writeWorkspaceCache, type BudgetWorkspace, type NewTransaction, type NotificationItem, type WorkspaceRecord, type WorkspaceSnapshot } from './lib/budget-api'
import { showBrowserNotification } from './lib/browser-notifications'
import { accountBalance, assignedReserve, goalReserve, totalLiquidBalance } from './lib/finance'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { FinanceAssistantContext, TransactionDraft } from './lib/gemini'

const themeKey = 'null-money:theme'
const workspaceKey = 'null-money:workspace'
const readWorkspacePreference = () => { try { return localStorage.getItem(workspaceKey) } catch { return null } }
const saveWorkspacePreference = (workspace: BudgetWorkspace) => { try { localStorage.setItem(workspaceKey, workspace) } catch { /* preference persistence is optional */ } }
const clearWorkspacePreference = () => { try { localStorage.removeItem(workspaceKey) } catch { /* preference persistence is optional */ } }
const navSections = ['Dashboard', 'Budget', 'Transactions', 'Accounts', 'Goals', 'Subscriptions', 'Reports', 'Settings'] as const
const pathFor = (section: string) => `/app/${section.toLowerCase()}`
const navFromPath = () => { const slug = window.location.pathname.split('/')[2]; if (slug === 'plan') return 'Budget'; return navSections.find((item) => item.toLowerCase() === slug) ?? 'Dashboard' }
const currentMonthKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` }

function AppLoadingScreen({ theme, message }: { theme: ThemeName; message: string }) {
  return <div className="app app-loading-screen" data-theme={theme} role="status" aria-live="polite"><div className="loading-atmosphere" aria-hidden="true"><i /><i /></div><div className="app-loading-card"><span className="loading-brand">NULL</span><strong>{message}</strong><small>YOUR MONEY SPACE IS ALMOST READY</small><div className="loading-progress" aria-hidden="true"><i /></div></div></div>
}

function LedgerLoadingState() {
  return <Glass className="ledger-loading-state"><div className="ledger-loading-copy" role="status" aria-live="polite"><span><i /><i /><i /></span><strong>SYNCING YOUR LEDGER</strong><small>Using your last saved snapshot while fresh data arrives.</small></div></Glass>
}

function App() {
  const [workspace, setWorkspace] = useState<BudgetWorkspace | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [workspacesReady, setWorkspacesReady] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(() => { try { const saved = localStorage.getItem(themeKey); if (saved === 'black' || saved === 'red' || saved === 'silver') return saved; return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'silver' } catch { return 'silver' } })
  const [entryView, setEntryView] = useState<'landing' | 'login'>(() => window.location.pathname === '/login' || window.location.pathname.startsWith('/app/') ? 'login' : 'landing')
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [currency, setCurrency] = useState<'USD' | 'LBP'>('USD')
  const [activeNav, setActiveNav] = useState<string>(navFromPath)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(currentMonthKey)
  const [data, setData] = useState<WorkspaceSnapshot | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft | null>(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const sessionUserId = session?.user.id ?? null

  const commitData = useCallback((next: WorkspaceSnapshot) => { setData(next); if (workspace && sessionUserId) writeWorkspaceCache(sessionUserId, workspace, next) }, [workspace, sessionUserId])
  const refreshAll = useCallback(async (showLoader = false) => {
    if (!workspace || !sessionUserId) return
    if (showLoader) setLoading(true)
    setDataError('')
    try { commitData(await loadWorkspaceSnapshot(workspace)) }
    catch (reason) { setDataError(reason instanceof Error ? reason.message : 'Could not load your saved budget data.') }
    finally { if (showLoader) setLoading(false) }
  }, [workspace, sessionUserId, commitData])

  useEffect(() => { try { localStorage.setItem(themeKey, theme) } catch { /* preference persistence is optional */ } }, [theme])
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    let active = true
    void supabase.auth.getSession().then(({ data: { session: next } }) => { if (active) { setSession(next); setAuthReady(true) } })
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession((current) => current?.user.id === next?.user.id ? current : next)
      setAuthReady(true)
      if (event === 'PASSWORD_RECOVERY') { setRecoveryMode(true); setEntryView('login'); setWorkspace(null) }
      if (!next) { setWorkspace(null); setWorkspaces([]); setWorkspacesReady(false); clearWorkspacePreference() }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])
  const refreshWorkspaces = useCallback(async () => {
    if (!sessionUserId) return []
    const rows = await loadUserWorkspaces()
    setWorkspaces(rows)
    setWorkspacesReady(true)
    return rows
  }, [sessionUserId])
  useEffect(() => {
    if (!sessionUserId) return
    let active = true
    setWorkspacesReady(false)
    void loadUserWorkspaces().then((rows) => {
      if (!active) return
      setWorkspaces(rows)
      setWorkspacesReady(true)
      const saved = readWorkspacePreference()
      if (saved && rows.some((item) => item.slug === saved)) setWorkspace(saved)
      else { setWorkspace(null); clearWorkspacePreference() }
    }).catch((reason) => { if (active) { setWorkspacesReady(true); setDataError(reason instanceof Error ? reason.message : 'Could not load your workspaces.') } })
    return () => { active = false }
  }, [sessionUserId])
  useEffect(() => {
    const root = document.documentElement
    const mobileViewport = window.matchMedia('(max-width: 900px)')
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let frame: number | undefined
    let pageScrollPending = false
    const renderScrollState = () => {
      frame = undefined
      root.classList.add('is-scrolling')
      if (pageScrollPending) {
        pageScrollPending = false
        const viewport = Math.max(1, window.innerHeight)
        const documentHeight = Math.max(viewport, root.scrollHeight)
        const scrollRange = documentHeight - viewport
        const scrollTop = Math.min(scrollRange, Math.max(0, window.scrollY || root.scrollTop))
        const thumbHeight = Math.max(48, viewport * (viewport / documentHeight))
        const thumbTop = scrollRange > 0 ? (scrollTop / scrollRange) * (viewport - thumbHeight) : 0
        root.style.setProperty('--page-scroll-height', `${thumbHeight}px`)
        root.style.setProperty('--page-scroll-top', `${thumbTop}px`)
        root.classList.add('page-is-scrolling')
      }
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(() => root.classList.remove('is-scrolling', 'page-is-scrolling'), 650)
    }
    const markScrolling = (event: Event) => {
      if (mobileViewport.matches) return
      const target = event.target
      pageScrollPending ||= target === document || target === root || target === document.body
      if (frame === undefined) frame = window.requestAnimationFrame(renderScrollState)
    }
    window.addEventListener('scroll', markScrolling, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', markScrolling, true)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      if (hideTimer) clearTimeout(hideTimer)
      root.classList.remove('is-scrolling', 'page-is-scrolling')
    }
  }, [])
  useEffect(() => { const syncRoute = () => { if (window.location.pathname.startsWith('/app/')) setActiveNav(navFromPath()); else if (!workspace) setEntryView(window.location.pathname === '/login' ? 'login' : 'landing') }; window.addEventListener('popstate', syncRoute); return () => window.removeEventListener('popstate', syncRoute) }, [workspace])
  useEffect(() => { if (workspace && new URLSearchParams(window.location.search).get('action') === 'add') { setShowModal(true); window.history.replaceState({}, '', window.location.pathname) } }, [workspace])
  useEffect(() => {
    if (!workspace || !sessionUserId) { setLoading(false); setData(null); return }
    const cached = readWorkspaceCache(sessionUserId, workspace)
    if (cached) setData(cached)
    if (!supabaseConfigured) { setDataError('Supabase environment variables are missing. Restart the local server after adding .env.local.'); return }
    void refreshAll(!cached)
  }, [workspace, sessionUserId, refreshAll])

  const transactions = useMemo(() => data?.transactions ?? [], [data?.transactions])
  const accounts = useMemo(() => data?.accounts ?? [], [data?.accounts])
  const categories = useMemo(() => data?.categories ?? [], [data?.categories])
  const budgets = useMemo(() => data?.budgets ?? [], [data?.budgets])
  const goals = useMemo(() => data?.goals ?? [], [data?.goals])
  const subscriptions = useMemo(() => data?.subscriptions ?? [], [data?.subscriptions])
  const transfers = useMemo(() => data?.transfers ?? [], [data?.transfers])
  const goalContributions = useMemo(() => data?.goalContributions ?? [], [data?.goalContributions])
  const notifications = useMemo(() => data?.notifications ?? [], [data?.notifications])
  const monthlyBudgets = useMemo(() => data?.monthlyBudgets ?? [], [data?.monthlyBudgets])
  const budgetAllocations = useMemo(() => data?.budgetAllocations ?? [], [data?.budgetAllocations])
  const exchangeRate = data?.settings.exchangeRate ?? 89500
  const monthlyBudget = effectiveMonthlyBudget(monthlyBudgets, month, 0)
  const budgetsForMonth = useMemo(() => budgets.map((item) => ({ ...item, monthlyLimitUsd: effectiveBudgetAllocation(budgetAllocations, item.id, month, item.monthlyLimitUsd) })), [budgets, budgetAllocations, month])
  const filtered = useMemo(() => transactions.filter((item) => `${item.name} ${item.category} ${item.notes ?? ''}`.toLowerCase().includes(search.toLowerCase())), [transactions, search])
  const monthTransactions = useMemo(() => transactions.filter((item) => item.date.startsWith(month)), [transactions, month])
  const spent = useMemo(() => monthTransactions.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + Math.abs(item.amount), 0), [monthTransactions])
  const income = useMemo(() => monthTransactions.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0), [monthTransactions])
  const balance = useMemo(() => totalLiquidBalance(accounts, transactions, transfers), [accounts, transactions, transfers])
  const mainAccount = useMemo(() => accounts.find((item) => item.active) ?? accounts[0] ?? null, [accounts])
  const mainAccountBalance = useMemo(() => mainAccount ? accountBalance(mainAccount, transactions, transfers) : 0, [mainAccount, transactions, transfers])
  const reservedGoals = useMemo(() => goalReserve(goalContributions), [goalContributions])
  const reservedBudgets = useMemo(() => assignedReserve(budgetAllocations, monthlyBudgets, transactions), [budgetAllocations, monthlyBudgets, transactions])
  const unallocatedCash = balance - reservedGoals - reservedBudgets
  const unreadCount = notifications.filter((item) => !item.readAt).length
  const formatMoney = (value: number) => currency === 'USD' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : `${Math.round(value * exchangeRate).toLocaleString('en-US')} LBP`

  const assistantContext = useMemo<FinanceAssistantContext>(() => ({
    workspace: workspace ?? 'live',
    displayCurrency: currency,
    exchangeRate,
    month,
    summary: {
      totalLiquidBalanceUsd: balance,
      mainAccountBalanceUsd: mainAccountBalance,
      unallocatedCashUsd: unallocatedCash,
      spentThisMonthUsd: spent,
      incomeThisMonthUsd: income,
      monthlyBudgetUsd: monthlyBudget,
    },
    accounts: accounts.map((item) => ({
      id: item.id,
      name: item.name,
      currency: item.currency,
      active: item.active,
      primary: item.id === mainAccount?.id,
      balanceUsd: accountBalance(item, transactions, transfers),
    })),
    categories: categories.map(({ id, name, group, active }) => ({ id, name, group, active })),
    budgets: budgetsForMonth.map(({ id, name, categoryId, monthlyLimitUsd, active }) => ({ id, name, categoryId, monthlyLimitUsd, active })),
    goals: goals.map(({ id, name, targetAmountUsd, savedAmountUsd, targetDate, active }) => ({ id, name, targetAmountUsd, savedAmountUsd, targetDate, active })),
    subscriptions: subscriptions.map(({ id, name, amountUsd, originalAmount, originalCurrency, dueDay, active }) => ({ id, name, amountUsd, originalAmount, originalCurrency, dueDay, active })),
    transactions: transactions.slice(0, 500).map(({ id, name, category, date, amount, kind, originalAmount, originalCurrency, exchangeRate: lockedRate, notes, accountId }) => ({ id, name, category, date, amount, kind, originalAmount, originalCurrency, exchangeRate: lockedRate, notes, accountId })),
    transfers: transfers.map(({ id, fromAccountId, toAccountId, amountUsd, date }) => ({ id, fromAccountId, toAccountId, amount: amountUsd, date })),
  }), [workspace, currency, exchangeRate, month, balance, mainAccount, mainAccountBalance, unallocatedCash, spent, income, monthlyBudget, accounts, categories, budgetsForMonth, goals, subscriptions, transactions, transfers])

  useEffect(() => {
    if (!workspace || !data?.settings.browserNotifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const storageKey = `null-money:browser-notifications:${session?.user.id ?? 'signed-out'}:${workspace}`
    const seen = new Set<number>(JSON.parse(localStorage.getItem(storageKey) ?? '[]'))
    const pending = notifications.filter((item) => !item.readAt && item.type === 'warning' && !seen.has(item.id))
    if (!pending.length) return
    void Promise.all(pending.map((item) => showBrowserNotification(item.title, item.body, item.actionTarget ? pathFor(item.actionTarget) : '/app/subscriptions'))).then(() => {
      pending.forEach((item) => seen.add(item.id))
      localStorage.setItem(storageKey, JSON.stringify([...seen].slice(-100)))
    })
  }, [data?.settings.browserNotifications, notifications, workspace, session?.user.id])

  const addTransaction = async (transaction: NewTransaction) => { if (!workspace) return; await createTransaction(workspace, transaction); setShowModal(false); setTransactionDraft(null); setNotice(`TRANSACTION SAVED TO ${workspace.toUpperCase()}`); await refreshAll() }
  const addAssistantTransaction = async (draft: TransactionDraft) => {
    const account = accounts.find((item) => item.id === draft.accountId && item.active) ?? (draft.accountId == null ? mainAccount : null)
    if (!account) throw new Error('Choose an active account before I can create that transaction.')
    const category = draft.kind === 'expense' ? categories.find((item) => item.active && item.name.toLowerCase() === draft.category.toLowerCase()) : null
    if (draft.kind === 'expense' && !category) throw new Error('Choose an active expense category before I can create that transaction.')
    const originalAmount = Math.abs(Number(draft.amount))
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) throw new Error('The transaction needs an amount greater than zero.')
    const amountUsd = draft.currency === 'LBP' ? originalAmount / exchangeRate : originalAmount
    const linkedBudget = draft.kind === 'expense' ? budgetsForMonth.find((item) => item.active && item.categoryId === category?.id) : undefined
    await addTransaction({
      name: draft.name.trim(), category: draft.category.trim(), date: draft.date, kind: draft.kind,
      amount: Number((amountUsd * (draft.kind === 'expense' ? -1 : 1)).toFixed(2)), originalAmount,
      originalCurrency: draft.currency, exchangeRate, notes: draft.notes?.trim() ?? '', accountId: account.id,
      budgetItemId: linkedBudget?.id ?? null,
    })
  }
  const openTransaction = (draft: TransactionDraft | null = null) => { setTransactionDraft(draft); setShowScanner(false); setShowModal(true) }
  const removeTransaction = async () => { if (!transactionToDelete || !workspace) return; await deleteTransaction(workspace, transactionToDelete.id); setTransactionToDelete(null); setSelectedTransaction(null); setNotice('TRANSACTION DELETED'); await refreshAll() }
  const updateExchangeRate = async (rate: number) => { if (!workspace) return; await saveExchangeRate(workspace, rate); setNotice('DEFAULT EXCHANGE RATE UPDATED'); await refreshAll() }
  const updateNotificationPreferences = async (input: { enabled: boolean; reminderDays: number[]; browserNotifications: boolean }) => {
    if (!workspace || !data) return
    const previous = data
    const next = { ...data, settings: { ...data.settings, subscriptionRemindersEnabled: input.enabled, subscriptionReminderDays: input.reminderDays, browserNotifications: input.browserNotifications } }
    commitData(next)
    try { await saveNotificationPreferences(workspace, input); setNotice('NOTIFICATION PREFERENCES UPDATED'); void refreshAll() }
    catch (reason) { commitData(previous); throw reason }
  }
  const updateGeminiPreference = async (previewTransactions: boolean) => {
    if (!workspace || !data) return
    const previous = data
    commitData({ ...data, settings: { ...data.settings, geminiTransactionPreview: previewTransactions } })
    try { await saveGeminiTransactionPreference(workspace, previewTransactions); setNotice('GEMINI ACTION BEHAVIOR UPDATED'); void refreshAll() }
    catch (reason) { commitData(previous); throw reason }
  }
  const optimisticToggleFinance = (section: string, id: number, active: boolean) => {
    if (!data) return
    const key = section === 'Accounts' ? 'accounts' : section === 'Goals' ? 'goals' : section === 'Subscriptions' ? 'subscriptions' : section === 'Categories' ? 'categories' : 'budgets'
    commitData({ ...data, [key]: data[key].map((item) => item.id === id ? { ...item, active } : item) } as WorkspaceSnapshot)
  }
  const goTo = (section: string) => { const target = section === 'Plan' ? 'Budget' : section; setActiveNav(target); window.history.pushState({}, '', pathFor(target)); setSearch(''); setNotice(null); setShowNotifications(false) }
  const openNotification = async (item: NotificationItem) => { if (!workspace || !data) return; if (!item.readAt) { const previous = data; const now = new Date().toISOString(); commitData({ ...data, notifications: data.notifications.map((entry) => entry.id === item.id ? { ...entry, readAt: now } : entry) }); try { await markNotificationRead(workspace, item.id) } catch (reason) { commitData(previous); throw reason } } if (item.actionTarget) goTo(item.actionTarget) }
  const markAll = async () => { if (!workspace || !data) return; const previous = data; const now = new Date().toISOString(); commitData({ ...data, notifications: data.notifications.map((item) => ({ ...item, readAt: item.readAt ?? now })) }); try { await markAllNotificationsRead(workspace) } catch (reason) { commitData(previous); throw reason } }
  const changeEntryView = (view: 'landing' | 'login') => { setEntryView(view); window.history.pushState({}, '', view === 'login' ? '/login' : '/') }
  const enterWorkspace = (next: BudgetWorkspace) => { if (!session || !workspaces.some((item) => item.slug === next)) return; saveWorkspacePreference(next); setData(readWorkspaceCache(session.user.id, next)); setWorkspace(next); setActiveNav('Dashboard'); window.history.pushState({}, '', pathFor('Dashboard')) }
  const addWorkspace = async (name: string) => { const created = await createUserWorkspace(name); const rows = await refreshWorkspaces(); saveWorkspacePreference(created.slug); setData(null); setWorkspace(created.slug); if (!rows.some((item) => item.slug === created.slug)) setWorkspaces((current) => [...current, created]); setActiveNav('Dashboard'); window.history.pushState({}, '', pathFor('Dashboard')); return created }
  const clearWorkspace = async () => { if (!workspace || !session) return; await clearUserWorkspace(workspace); removeWorkspaceCache(session.user.id, workspace); setData(null); await refreshAll(true); setNotice('WORKSPACE DATA DELETED') }
  const removeWorkspace = async () => { if (!workspace || !session) return; const removed = workspace; await deleteUserWorkspace(removed); removeWorkspaceCache(session.user.id, removed); clearWorkspacePreference(); setWorkspace(null); setData(null); await refreshWorkspaces(); window.history.pushState({}, '', '/login') }
  const leaveWorkspace = () => { clearWorkspacePreference(); setEntryView('login'); window.history.pushState({}, '', '/login'); setWorkspace(null); setShowNotifications(false); setShowModal(false); setSelectedTransaction(null); setNotice(null) }
  const signIn = async (email: string, password: string) => { if (!supabase) throw new Error('Supabase is not configured.'); const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; setSession(auth.session) }
  const signUp = async (email: string, password: string) => { if (!supabase) throw new Error('Supabase is not configured.'); const { data: auth, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/login` } }); if (error) throw error; if (auth.session) { setSession(auth.session); return 'active' as const } return 'confirmation' as const }
  const resetPassword = async (email = session?.user.email ?? '') => { if (!supabase || !email) throw new Error('An account email is required.'); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` }); if (error) throw error }
  const updatePassword = async (password: string) => { if (!supabase) throw new Error('Supabase is not configured.'); const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; setRecoveryMode(false); setEntryView('login') }
  const signOut = async () => { if (!supabase) return; const { error } = await supabase.auth.signOut(); if (error) throw error; leaveWorkspace() }

  if (!authReady) return <AppLoadingScreen theme={theme} message="STARTING NULL MONEY" />
  if (session && !workspacesReady && !recoveryMode) return <AppLoadingScreen theme={theme} message="OPENING YOUR WORKSPACES" />
  if (!session || !workspace || recoveryMode) return <WorkspaceGate view={entryView} theme={theme} setTheme={setTheme} onView={changeEntryView} onSelect={enterWorkspace} workspaces={workspaces} onCreateWorkspace={addWorkspace} authenticated={Boolean(session)} accountEmail={session?.user.email ?? ''} recoveryMode={recoveryMode} onSignIn={signIn} onSignUp={signUp} onResetPassword={resetPassword} onUpdatePassword={updatePassword} />
  const financeSections = ['Accounts', 'Goals', 'Subscriptions'] as const
  const isFinanceSection = financeSections.includes(activeNav as typeof financeSections[number])

  return <div className="app" data-theme={theme}>
    <div className="wallpaper" aria-hidden="true"><span className="orb red-orb" /><span className="orb silver-orb" /><span className="wire wire-one" /><span className="wire wire-two" /><span className="micro-grid" /></div>
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      <Sidebar active={activeNav} onSelect={goTo} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <div className="workspace">
        <Topbar search={search} setSearch={setSearch} theme={theme} setTheme={setTheme} currency={currency} setCurrency={setCurrency} workspace={workspace} unreadCount={unreadCount} onAdd={() => openTransaction()} onNotifications={() => setShowNotifications(true)} onProfile={() => goTo('Settings')} onSwitchWorkspace={leaveWorkspace} />
        {dataError && <div className="data-status error" role="alert"><strong>DATA CONNECTION ISSUE</strong><span>{dataError}</span></div>}
        {loading && !data ? <LedgerLoadingState /> : activeNav === 'Dashboard' ? <main className="dashboard-main">
          <header className="dashboard-page-title"><h1>DASHBOARD</h1><button className="dashboard-add-action" onClick={() => accounts.length ? openTransaction() : goTo('Accounts')}><Plus set="curved" size={18} /><span>{accounts.length ? 'ADD TRANSACTION' : 'CREATE ACCOUNT'}</span></button></header>
          <div className="main-column">
            <Glass className="balance-panel"><div className="balance-copy"><span>GOOD MORNING, ELIO · {new Date().toLocaleDateString('en-LB', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</span><h1>{formatMoney(mainAccountBalance)}</h1><div className="available"><i />CURRENT BALANCE <span>{mainAccount?.name?.toUpperCase() ?? 'CREATE A MAIN ACCOUNT'}</span></div></div><div className="balance-system" aria-hidden="true"><span>{String(new Date().getMonth() + 1).padStart(2, '0')} / {String(new Date().getFullYear()).slice(-2)}</span><div>{Array.from({ length: 72 }, (_, i) => <i key={i} />)}</div><b /></div></Glass>
            <Glass className="overview-panel"><div className="panel-heading"><div><span className="signal-dot" />{new Date(`${month}-01T12:00:00`).toLocaleDateString('en-LB', { month: 'long', year: 'numeric' }).toUpperCase()} OVERVIEW</div></div><div className="metric-grid finance-overview dashboard-month-overview"><div><span>SPENT SO FAR ↓</span><strong>{formatMoney(spent)}</strong><small>{formatMoney(Math.max(0, monthlyBudget - spent))} left from {formatMoney(monthlyBudget)}</small></div><div><span>MONEY IN ↑</span><strong>{formatMoney(income)}</strong><small>Income submitted during this month</small></div></div></Glass>
            <Transactions transactions={filtered} pageSize={10} formatMoney={formatMoney} onViewAll={() => goTo('Transactions')} onSelect={setSelectedTransaction} />
          </div>
          <div className="right-column"><BudgetPulse month={month} onMonthChange={setMonth} spent={spent} budget={monthlyBudget} formatMoney={formatMoney} /><SubscriptionPanel subscriptions={subscriptions} accounts={accounts} budgets={budgetsForMonth} onViewAll={() => goTo('Subscriptions')} formatMoney={formatMoney} /><CategoryPanel onViewAll={() => goTo('Budget')} transactions={monthTransactions} budgets={budgetsForMonth} categories={categories} formatMoney={formatMoney} /></div>
        </main> : activeNav === 'Budget' ? <PlanModule workspace={workspace} month={month} setMonth={setMonth} monthlyBudgets={monthlyBudgets} allocations={budgetAllocations} budgets={budgets} categories={categories} goals={goals} transactions={transactions} unallocatedCash={unallocatedCash} onChanged={() => refreshAll()} onNotice={setNotice} /> : activeNav === 'Reports' ? <ReportsModule transactions={transactions} months={monthlyBudgets} budgets={budgetsForMonth} /> : activeNav === 'Transactions' ? <LedgerModule transactions={filtered} accounts={accounts} categories={categories} formatMoney={formatMoney} onAdd={() => openTransaction()} onSelect={setSelectedTransaction} /> : activeNav === 'Settings' ? <FinancialSettings workspace={workspace} workspaces={workspaces} settings={data?.settings ?? { exchangeRate, monthlyBudget: 0, openingBalance: 0, subscriptionRemindersEnabled: true, subscriptionReminderDays: [7, 3, 1], browserNotifications: false, geminiTransactionPreview: true }} accountEmail={session.user.email ?? ''} onCreateWorkspace={addWorkspace} onSelectWorkspace={enterWorkspace} onClearWorkspace={clearWorkspace} onDeleteWorkspace={removeWorkspace} onSaveRate={updateExchangeRate} onSavePreferences={updateNotificationPreferences} onSaveGeminiPreference={updateGeminiPreference} onResetPassword={() => resetPassword()} onSignOut={signOut} /> : isFinanceSection ? <FinanceModule key={`${workspace}-${activeNav}-${month}`} workspace={workspace} section={activeNav as typeof financeSections[number]} exchangeRate={exchangeRate} monthlyBudget={monthlyBudget} month={month} accounts={accounts} categories={categories} budgets={budgetsForMonth} goals={goals} subscriptions={subscriptions} transactions={transactions} transfers={transfers} unallocatedCash={unallocatedCash} onTransfer={() => setShowTransfer(true)} onChanged={() => refreshAll()} onOptimisticToggle={optimisticToggleFinance} onNotice={setNotice} /> : <ManagedModule key={`${workspace}-${activeNav}`} workspace={workspace} section={activeNav} onNotice={setNotice} />}
      </div>
    </div>
    <MobileNav active={activeNav} onSelect={goTo} onAdd={() => accounts.length ? openTransaction() : goTo('Accounts')} />
    <button className="assistant-launcher" onClick={() => setShowAssistant(true)} aria-label="Ask Gemini"><Chat set="curved" size={23} /><i /></button>
    <InstallPrompt />
    {notice && <button className="section-toast glass" onClick={() => setNotice(null)}>{notice}<span> ×</span></button>}
    {showNotifications && <NotificationDrawer items={notifications} onClose={() => setShowNotifications(false)} onMarkAll={markAll} onOpen={openNotification} />}
    {selectedTransaction && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTransaction(null)}><Glass className="detail-sheet"><span>TRANSACTION DETAIL</span><h2>{selectedTransaction.name}</h2><dl><div><dt>ACCOUNT</dt><dd>{accounts.find((item) => item.id === selectedTransaction.accountId)?.name ?? 'Unassigned'}</dd></div><div><dt>CATEGORY</dt><dd>{selectedTransaction.category}</dd></div><div><dt>DATE</dt><dd>{new Date(`${selectedTransaction.date}T12:00:00`).toLocaleDateString('en-LB', { month: 'long', day: 'numeric', year: 'numeric' })}</dd></div><div><dt>LEDGER VALUE</dt><dd>{formatMoney(selectedTransaction.amount)}</dd></div><div><dt>ORIGINAL ENTRY</dt><dd>{selectedTransaction.originalAmount?.toLocaleString()} {selectedTransaction.originalCurrency}</dd></div><div><dt>LOCKED RATE</dt><dd>{selectedTransaction.exchangeRate?.toLocaleString()} LBP/USD</dd></div>{selectedTransaction.budgetItemId && <div><dt>BUDGET</dt><dd>{budgets.find((item) => item.id === selectedTransaction.budgetItemId)?.name ?? 'Linked budget'}</dd></div>}{selectedTransaction.notes && <div><dt>NOTES</dt><dd>{selectedTransaction.notes}</dd></div>}</dl><div className="detail-actions"><button className="delete-action" onClick={() => setTransactionToDelete(selectedTransaction)}><Delete set="curved" size={18} />DELETE</button><button onClick={() => setSelectedTransaction(null)}>DONE</button></div></Glass></div>}
    {transactionToDelete && <ConfirmDialog destructive title={`DELETE ${transactionToDelete.name.toUpperCase()}?`} body="This transaction will be removed from the ledger and related balance and budget totals will be recalculated." confirmLabel="DELETE TRANSACTION" onCancel={() => setTransactionToDelete(null)} onConfirm={removeTransaction} />}
    {showModal && <AddTransactionModal key={`${transactionDraft?.name ?? 'manual'}-${transactionDraft?.date ?? ''}`} draft={transactionDraft} exchangeRate={exchangeRate} accounts={accounts} categories={categories} budgets={budgetsForMonth} onClose={() => { setShowModal(false); setTransactionDraft(null) }} onScanReceipt={() => { setShowModal(false); setTransactionDraft(null); setShowScanner(true) }} onAdd={addTransaction} />}
    {showScanner && <ReceiptScannerModal categories={categories} onClose={() => setShowScanner(false)} onExtracted={(draft) => openTransaction(draft)} />}
    {showAssistant && <GeminiAssistant context={assistantContext} conversationScope={`${session.user.id}:${workspace}`} previewTransactions={data?.settings.geminiTransactionPreview ?? true} onClose={() => setShowAssistant(false)} onNavigate={goTo} onDraft={(draft) => openTransaction(draft)} onCreateTransaction={addAssistantTransaction} onOpenSettings={() => { setShowAssistant(false); goTo('Settings') }} />}
    {showTransfer && <AccountTransferModal workspace={workspace} accounts={accounts} exchangeRate={exchangeRate} onClose={() => setShowTransfer(false)} onSaved={() => refreshAll()} />}
  </div>
}

export default App
