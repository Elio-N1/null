import { useEffect, useState } from 'react'
import { ArrowLeft, Chat, Lock, Notification, ShieldDone, TickSquare, Wallet } from 'react-iconly'
import type { AppSettings, BudgetWorkspace, WorkspaceRecord } from '../lib/budget-api'
import { browserNotificationPermission, browserNotificationsSupported, requestBrowserNotifications } from '../lib/browser-notifications'
import { AVAILABLE_GEMINI_MODELS, DEFAULT_GEMINI_MODEL, fetchAvailableGeminiModels, getGeminiStatus, sanitizeModel, saveGeminiKey, saveGeminiModel, type GeminiModelOption, type GeminiStatus } from '../lib/gemini'
import ActiveToggle from './ActiveToggle'
import ConfirmDialog from './ConfirmDialog'
import FormattedNumberInput from './FormattedNumberInput'
import { Glass } from './Glass'

type SettingsSection = 'currency' | 'notifications' | 'gemini' | 'workspaces' | 'account'
type Props = {
  workspace: BudgetWorkspace
  workspaces: WorkspaceRecord[]
  settings: AppSettings
  accountEmail: string
  onCreateWorkspace: (name: string) => Promise<WorkspaceRecord>
  onSelectWorkspace: (workspace: BudgetWorkspace) => void
  onClearWorkspace: () => Promise<void>
  onDeleteWorkspace: () => Promise<void>
  onSaveRate: (rate: number) => Promise<void>
  onSavePreferences: (input: { enabled: boolean; reminderDays: number[]; browserNotifications: boolean }) => Promise<void>
  onResetPassword: () => Promise<void>
  onSignOut: () => Promise<void>
}

const sectionFromPath = (): SettingsSection | null => {
  const value = window.location.pathname.split('/')[3]
  return value === 'currency' || value === 'notifications' || value === 'gemini' || value === 'workspaces' || value === 'account' ? value : null
}

const mergeModelOptions = (fetched: GeminiModelOption[]): GeminiModelOption[] => {
  const map = new Map<string, GeminiModelOption>()
  for (const item of AVAILABLE_GEMINI_MODELS) map.set(item.id, item)
  for (const item of fetched) map.set(item.id, item)
  return Array.from(map.values())
}

export default function FinancialSettings(props: Props) {
  const { workspace, workspaces, settings, accountEmail, onCreateWorkspace, onSelectWorkspace, onClearWorkspace, onDeleteWorkspace, onSaveRate, onSavePreferences, onResetPassword, onSignOut } = props
  const [section, setSection] = useState<SettingsSection | null>(sectionFromPath)
  const [rate, setRate] = useState(String(settings.exchangeRate))
  const [remindersEnabled, setRemindersEnabled] = useState(settings.subscriptionRemindersEnabled ?? true)
  const [reminderDays, setReminderDays] = useState((settings.subscriptionReminderDays ?? [7, 3, 1]).join(', '))
  const [browserEnabled, setBrowserEnabled] = useState(settings.browserNotifications ?? false)
  const [permission, setPermission] = useState(browserNotificationPermission())
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [gemini, setGemini] = useState<GeminiStatus | null>(null)
  const [geminiKey, setGeminiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_GEMINI_MODEL)
  const [modelOptions, setModelOptions] = useState<GeminiModelOption[]>(AVAILABLE_GEMINI_MODELS)
  const [loadingModels, setLoadingModels] = useState(false)
  const [checkingGemini, setCheckingGemini] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [dangerAction, setDangerAction] = useState<'clear' | 'delete' | null>(null)

  useEffect(() => { setRate(String(settings.exchangeRate)); setRemindersEnabled(settings.subscriptionRemindersEnabled ?? true); setReminderDays((settings.subscriptionReminderDays ?? [7, 3, 1]).join(', ')); setBrowserEnabled(settings.browserNotifications ?? false) }, [settings])
  useEffect(() => { const sync = () => setSection(sectionFromPath()); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync) }, [])
  useEffect(() => {
    if (section !== 'gemini') return
    let active = true
    setCheckingGemini(true)
    getGeminiStatus()
      .then((value) => {
        if (!active) return
        setGemini(value)
        if (value.model) setSelectedModel(sanitizeModel(value.model))
        if (value.configured) {
          setLoadingModels(true)
          fetchAvailableGeminiModels()
            .then((list) => { if (active && list?.length) setModelOptions(mergeModelOptions(list)) })
            .catch(() => { /* keep default list */ })
            .finally(() => { if (active) setLoadingModels(false) })
        }
      })
      .catch(() => { if (active) setGemini(null) })
      .finally(() => { if (active) setCheckingGemini(false) })
    return () => { active = false }
  }, [section])

  const openSection = (next: SettingsSection | null) => { setSection(next); setError(''); setSaved(null); window.history.pushState({}, '', next ? `/app/settings/${next}` : '/app/settings') }
  const saveRate = async (event: React.FormEvent) => { event.preventDefault(); const value = Number(rate); if (!Number.isFinite(value) || value <= 0) return setError('Enter a valid LBP exchange rate greater than zero.'); setSaving('rate'); setError(''); try { await onSaveRate(value); setSaved('rate') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the exchange rate.') } finally { setSaving(null) } }
  const saveNotifications = async (event: React.FormEvent) => { event.preventDefault(); const days = [...new Set(reminderDays.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 0 && value <= 30))]; if (!days.length) return setError('Enter reminder days between 0 and 30.'); setSaving('notifications'); setError(''); try { if (browserEnabled && permission !== 'granted') setPermission(await requestBrowserNotifications()); await onSavePreferences({ enabled: remindersEnabled, reminderDays: days, browserNotifications: browserEnabled }); setSaved('notifications') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update notification preferences.') } finally { setSaving(null) } }

  const saveAiSettings = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSaving('gemini')
    const modelToSave = sanitizeModel(selectedModel)
    try {
      if (geminiKey.trim()) {
        if (geminiKey.trim().length < 20) return setError('Paste a valid Gemini API key.')
        const status = await saveGeminiKey(geminiKey.trim(), modelToSave)
        setGemini(status)
        if (status.model) setSelectedModel(sanitizeModel(status.model))
        setGeminiKey('')
        setSaved('gemini')
        // Refresh available models for key
        fetchAvailableGeminiModels().then((list) => { if (list?.length) setModelOptions(mergeModelOptions(list)) }).catch(() => {})
      } else {
        const status = await saveGeminiModel(modelToSave)
        setGemini(status)
        if (status.model) setSelectedModel(sanitizeModel(status.model))
        setSaved('gemini_model')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Gemini configuration could not be saved.')
    } finally {
      setSaving(null)
    }
  }

  const addWorkspace = async (event: React.FormEvent) => { event.preventDefault(); if (!workspaceName.trim()) return; setSaving('workspace'); setError(''); try { await onCreateWorkspace(workspaceName.trim()); setWorkspaceName('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the workspace.') } finally { setSaving(null) } }

  const cards = [
    { id: 'currency' as const, title: 'Currency & rates', copy: 'Default LBP exchange rate and historical conversion behavior.', status: `${settings.exchangeRate.toLocaleString()} LBP / USD`, Icon: Wallet },
    { id: 'notifications' as const, title: 'Notifications', copy: 'Subscription reminder timing and browser notification channels.', status: remindersEnabled ? 'REMINDERS ACTIVE' : 'REMINDERS PAUSED', Icon: Notification },
    { id: 'gemini' as const, title: 'Gemini AI', copy: 'Secure API key, model selection, assistant connection, voice, and reviewable actions.', status: gemini?.configured ? gemini.model : DEFAULT_GEMINI_MODEL, Icon: Chat },
    { id: 'workspaces' as const, title: 'Workspaces', copy: 'Create private ledgers, switch workspace, or securely remove data.', status: `${workspaces.length} ${workspaces.length === 1 ? 'WORKSPACE' : 'WORKSPACES'}`, Icon: Wallet },
    { id: 'account' as const, title: 'Account & security', copy: 'Email identity, password recovery, workspace access, and sign out.', status: accountEmail || 'EMAIL ACCOUNT', Icon: Lock },
  ]

  if (!section) return <Glass className="module-view financial-settings settings-hub">
    <div className="module-heading"><div><span>NULL / {workspace.toUpperCase()} / SETTINGS</span><h1>SETTINGS</h1><p>Choose one area to manage. Each section opens in its own focused workspace.</p></div></div>
    <div className="settings-category-grid">{cards.map(({ id, title, copy, status, Icon }, index) => <button key={id} className="settings-category-card" onClick={() => openSection(id)}><span className="settings-category-number">0{index + 1}</span><span className="settings-category-icon"><Icon set="curved" size={25} /></span><span className="settings-category-copy"><strong>{title}</strong><small>{copy}</small></span><span className="settings-category-status">{status}</span><b>→</b></button>)}</div>
  </Glass>

  return <Glass className="module-view financial-settings settings-detail">
    <button className="settings-back" onClick={() => openSection(null)}><ArrowLeft set="curved" size={18} />ALL SETTINGS</button>

    {section === 'currency' && <form className="settings-focus-card" onSubmit={saveRate}><div className="settings-focus-heading"><span><Wallet set="curved" size={23} /></span><div><small>CURRENCY DEFAULT</small><h1>CURRENCY & RATES</h1><p>New LBP transactions use this value by default. Every saved transaction permanently retains its own submitted rate.</p></div></div><label><span>DEFAULT LBP PER 1 USD</span><FormattedNumberInput value={rate} onValueChange={(value) => { setRate(value); setSaved(null) }} allowDecimals={false} placeholder="89,500" /></label><button className="settings-save" type="submit" disabled={Boolean(saving)}><TickSquare set="curved" size={19} />{saving === 'rate' ? 'SAVING…' : saved === 'rate' ? 'SAVED' : 'SAVE DEFAULT RATE'}</button></form>}

    {section === 'notifications' && <form className="settings-focus-card" onSubmit={saveNotifications}><div className="settings-focus-heading"><span><Notification set="curved" size={23} /></span><div><small>SUBSCRIPTION ALERTS</small><h1>NOTIFICATIONS</h1><p>Choose when subscription reminders appear and whether they should also reach the device notification center.</p></div></div><div className="settings-toggle-row"><div><strong>IN-APP REMINDERS</strong><small>Generate alerts before subscription due dates.</small></div><ActiveToggle active={remindersEnabled} label="subscription reminders" onToggle={() => setRemindersEnabled((value) => !value)} /></div><label><span>REMIND ME BEFORE · DAYS</span><input value={reminderDays} onChange={(event) => setReminderDays(event.target.value)} placeholder="7, 3, 1" inputMode="numeric" /><small>Comma-separated days from 0 to 30.</small></label><div className="settings-toggle-row"><div><strong>BROWSER / PUSH NOTIFICATIONS</strong><small>{!browserNotificationsSupported() ? 'Not supported by this browser.' : permission === 'granted' ? 'Permission granted.' : permission === 'denied' ? 'Blocked in browser settings.' : 'Permission is requested only when you save.'}</small></div><ActiveToggle active={browserEnabled} label="browser notifications" disabled={!browserNotificationsSupported() || permission === 'denied'} onToggle={() => setBrowserEnabled((value) => !value)} /></div><button className="settings-save" type="submit" disabled={Boolean(saving)}><TickSquare set="curved" size={19} />{saving === 'notifications' ? 'SAVING…' : saved === 'notifications' ? 'SAVED' : 'SAVE NOTIFICATIONS'}</button></form>}

    {section === 'gemini' && <form className="settings-focus-card gemini-focus" onSubmit={saveAiSettings}><div className="settings-focus-heading"><span><Chat set="curved" size={23} /></span><div><small>AI CONNECTION</small><h1>GEMINI AI</h1><p>Connect your Gemini API key and select your preferred model for financial questions, receipts, and ledger assistant tasks.</p></div></div><div className={`gemini-status ${gemini?.configured ? 'connected' : ''}`}><span><i />{checkingGemini ? 'CHECKING CONNECTION' : gemini?.configured ? 'CONNECTED' : 'NOT CONNECTED'}</span><strong>{gemini?.model || selectedModel}</strong><small>{gemini?.configured ? 'Your encrypted key is available only to the authenticated server function.' : 'Paste a key below. It is verified before encrypted storage in Supabase Vault.'}</small></div><label><span>AI MODEL {loadingModels ? '· FETCHING YOUR KEY MODELS…' : ''}</span><select value={selectedModel} onChange={(event) => { setSelectedModel(event.target.value); setSaved(null) }}>{modelOptions.map((item) => <option key={item.id} value={item.id}>{item.name || item.id} {item.description ? `— ${item.description}` : ''}</option>)}</select><small>Select the model Gemini will use for receipt OCR and AI ledger assistant.</small></label><label><span>GEMINI API KEY</span><input type="password" autoComplete="off" spellCheck={false} value={geminiKey} onChange={(event) => { setGeminiKey(event.target.value); setSaved(null) }} placeholder={gemini?.configured ? 'Paste a new key to replace the saved key' : 'Paste your Gemini API key'} /><small>The key is sent over your authenticated connection, encrypted at rest, and never returned to the browser.</small></label><div className="secure-key-guide"><ShieldDone set="curved" size={23} /><span><strong>SECURE SERVER STORAGE</strong><small>Saving verifies the key with Google, then stores it in Supabase Vault for this signed-in account.</small></span></div><button className="settings-save" type="submit" disabled={Boolean(saving) || (!geminiKey.trim() && selectedModel === (gemini?.model || DEFAULT_GEMINI_MODEL))}><ShieldDone set="curved" size={19} />{saving === 'gemini' ? 'VERIFYING & SAVING…' : saved === 'gemini' ? 'KEY & MODEL SAVED' : saved === 'gemini_model' ? 'MODEL SAVED' : geminiKey.trim() ? (gemini?.configured ? 'REPLACE KEY & SAVE MODEL' : 'SAVE API KEY & MODEL') : 'SAVE AI MODEL'}</button></form>}

    {section === 'workspaces' && <section className="settings-focus-card workspace-focus"><div className="settings-focus-heading"><span><Wallet set="curved" size={23} /></span><div><small>PRIVATE LEDGERS</small><h1>WORKSPACES</h1><p>Each workspace belongs to this email account. Other signed-in users cannot read or modify it.</p></div></div><div className="workspace-settings-list">{workspaces.map((item) => <button key={item.id} className={item.slug === workspace ? 'active' : ''} onClick={() => item.slug !== workspace && onSelectWorkspace(item.slug)}><span><strong>{item.name}</strong><small>{item.slug === workspace ? 'CURRENT WORKSPACE' : 'SWITCH TO WORKSPACE'}</small></span><b>{item.slug === workspace ? 'ACTIVE' : 'OPEN →'}</b></button>)}</div><form className="workspace-settings-create" onSubmit={addWorkspace}><label><span>CREATE ANOTHER WORKSPACE</span><input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={60} placeholder="Workspace name" /></label><button className="settings-save" disabled={saving === 'workspace' || !workspaceName.trim()}><Wallet set="curved" size={19} />{saving === 'workspace' ? 'CREATING…' : 'CREATE WORKSPACE'}</button></form><div className="workspace-danger-zone"><div><strong>CLEAR CURRENT WORKSPACE</strong><small>Delete all finance records while keeping the workspace and settings.</small><button className="delete-action" onClick={() => setDangerAction('clear')}>DELETE ALL DATA</button></div><div><strong>DELETE CURRENT WORKSPACE</strong><small>Delete this workspace and all of its data. This cannot be undone.</small><button className="delete-action" onClick={() => setDangerAction('delete')}>DELETE WORKSPACE</button></div></div></section>}

    {section === 'account' && <section className="settings-focus-card account-focus"><div className="settings-focus-heading"><span><Lock set="curved" size={23} /></span><div><small>IDENTITY & ACCESS</small><h1>ACCOUNT</h1><p>Your Supabase email session protects every user-owned workspace and server-side AI connection.</p></div></div><div className="account-email"><span>SIGNED IN AS</span><strong>{accountEmail}</strong><small>Current workspace · {workspace.toUpperCase()}</small></div><div className="account-actions"><button onClick={async () => { setSaving('reset'); setError(''); try { await onResetPassword(); setSaved('reset') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send the reset email.') } finally { setSaving(null) } }}><ShieldDone set="curved" size={19} />{saved === 'reset' ? 'RESET EMAIL SENT' : saving === 'reset' ? 'SENDING…' : 'SEND PASSWORD RESET'}</button><button className="sign-out-action" onClick={() => void onSignOut()}><Lock set="curved" size={19} />SIGN OUT</button></div></section>}

    {error && <div className="form-error settings-error" role="alert">{error}</div>}
    {dangerAction && <ConfirmDialog destructive title={dangerAction === 'clear' ? 'DELETE ALL WORKSPACE DATA?' : 'DELETE THIS WORKSPACE?'} body={dangerAction === 'clear' ? 'Every account, transaction, budget, goal, subscription, and report in this workspace will be permanently deleted. The workspace itself and settings remain.' : 'The current workspace and every record inside it will be permanently deleted.'} confirmLabel={dangerAction === 'clear' ? 'DELETE ALL DATA' : 'DELETE WORKSPACE'} onCancel={() => setDangerAction(null)} onConfirm={async () => { const action = dangerAction; setDangerAction(null); setSaving(action); setError(''); try { if (action === 'clear') await onClearWorkspace(); else await onDeleteWorkspace() } catch (reason) { setError(reason instanceof Error ? reason.message : 'The workspace could not be deleted.') } finally { setSaving(null) } }} />}
  </Glass>
}
