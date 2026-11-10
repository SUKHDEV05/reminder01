import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell, CalendarDays, Check, CheckCheck, CircleCheck, Clock3, Pencil,
  Plus, Search, Sparkles, Trash2, X,
} from 'lucide-react'

const STORAGE_KEY = 'task-reminder-tasks'
const NOTICE_KEY = 'task-reminder-notified'
const filters = ['All tasks', 'Today', 'Pending', 'Completed', 'Overdue']
const priorities = ['Low', 'Medium', 'High']

function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function defaultTaskTime() {
  const date = new Date(Date.now() + 5 * 60 * 1000)
  date.setSeconds(0, 0)
  return localTime(date)
}

function readStorage(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function dueTimestamp(task) {
  return new Date(`${task.date}T${task.time}:00`).getTime()
}

function getStatus(task, now = Date.now()) {
  if (task.completed) return 'Completed'
  return dueTimestamp(task) < now ? 'Overdue' : 'Pending'
}

function formatDue(task) {
  const date = new Date(`${task.date}T12:00:00`)
  const today = localDate()
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  let dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (task.date === today) dateLabel = 'Today'
  else if (task.date === localDate(tomorrowDate)) dateLabel = 'Tomorrow'
  const timeLabel = new Date(`2000-01-01T${task.time}:00`).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${dateLabel} · ${timeLabel}`
}

function App() {
  const [tasks, setTasks] = useState(() => readStorage(STORAGE_KEY, []))
  const [editingId, setEditingId] = useState(null)
  const [filter, setFilter] = useState('All tasks')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState('Soonest first')
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState('')
  const [dueNotices, setDueNotices] = useState([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => 'Notification' in window && Notification.permission === 'granted',
  )
  const notifiedRef = useRef(new Set(readStorage(NOTICE_KEY, [])))
  const formRef = useRef(null)
  const titleRef = useRef(null)
  const [formValues, setFormValues] = useState(() => ({
    title: '',
    description: '',
    date: localDate(),
    time: defaultTaskTime(),
    priority: 'Medium',
  }))

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    window.localStorage.setItem(NOTICE_KEY, JSON.stringify([...notifiedRef.current]))
  }, [dueNotices])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const checkDueTasks = () => {
      const now = Date.now()
      const dueNow = tasks.filter((task) => (
        !task.completed
        && dueTimestamp(task) <= now
        && !notifiedRef.current.has(`${task.id}:${task.date}T${task.time}`)
      ))
      if (!dueNow.length) return

      dueNow.forEach((task) => {
        notifiedRef.current.add(`${task.id}:${task.date}T${task.time}`)
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Task reminder', {
            body: `${task.title} is due now.`,
            tag: task.id,
          })
        }
      })
      setDueNotices((current) => [...dueNow, ...current])
      setToast(dueNow.length === 1 ? `${dueNow[0].title} is due now` : `${dueNow.length} tasks are due now`)
    }

    checkDueTasks()
    const interval = window.setInterval(checkDueTasks, 1000)
    return () => window.clearInterval(interval)
  }, [tasks])

  const today = localDate()
  const summary = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => getStatus(task) === 'Pending').length,
    completed: tasks.filter((task) => task.completed).length,
    overdue: tasks.filter((task) => getStatus(task) === 'Overdue').length,
  }), [tasks])

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    const result = tasks.filter((task) => {
      const status = getStatus(task)
      const matchesSearch = !query || task.title.toLowerCase().includes(query)
      const matchesFilter = filter === 'All tasks'
        || (filter === 'Today' && task.date === today)
        || status === filter
      return matchesSearch && matchesFilter
    })
    return result.sort((first, second) => {
      const difference = dueTimestamp(first) - dueTimestamp(second)
      return sortOrder === 'Soonest first' ? difference : -difference
    })
  }, [tasks, search, filter, sortOrder, today])

  const resetForm = () => {
    setEditingId(null)
    setFormError('')
    setFormValues({
      title: '',
      description: '',
      date: localDate(),
      time: defaultTaskTime(),
      priority: 'Medium',
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const title = formValues.title.trim()
    if (!title) {
      setFormError('Add a title for your task.')
      titleRef.current?.focus()
      return
    }
    if (!formValues.date || !formValues.time) {
      setFormError('Choose a date and time for your task.')
      return
    }

    if (editingId) {
      setTasks((current) => current.map((task) => (
        task.id === editingId
          ? { ...task, ...formValues, title }
          : task
      )))
      setToast('Task updated')
    } else {
      const task = {
        ...formValues,
        title,
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        completed: false,
        createdAt: Date.now(),
      }
      setTasks((current) => [task, ...current])
      setToast('Task saved')
    }
    resetForm()
  }

  const editTask = (task) => {
    setEditingId(task.id)
    setFormError('')
    setFormValues({
      title: task.title,
      description: task.description,
      date: task.date,
      time: task.time,
      priority: task.priority,
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => titleRef.current?.focus(), 250)
  }

  const deleteTask = (task) => {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    setTasks((current) => current.filter((item) => item.id !== task.id))
    setDueNotices((current) => current.filter((item) => item.id !== task.id))
    if (editingId === task.id) resetForm()
    setToast('Task deleted')
  }

  const toggleCompleted = (task) => {
    setTasks((current) => current.map((item) => (
      item.id === task.id ? { ...item, completed: !item.completed } : item
    )))
    if (!task.completed) {
      setDueNotices((current) => current.filter((item) => item.id !== task.id))
      setToast('Task completed')
    } else {
      setToast('Task marked as pending')
    }
  }

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      setToast('Browser notifications are not supported here')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationsEnabled(permission === 'granted')
    setToast(permission === 'granted' ? 'Browser alerts enabled' : 'Browser alert permission was not granted')
  }

  const updateField = (event) => {
    setFormValues((current) => ({ ...current, [event.target.name]: event.target.value }))
    if (formError) setFormError('')
  }

  return (
    <div className="app-background min-h-screen text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a className="flex items-center gap-2.5" href="#" aria-label="Taskday home">
            <span className="brand-icon grid size-9 place-items-center rounded-xl text-white shadow-sm">
              <CheckCheck size={19} strokeWidth={2.2} />
            </span>
            <span className="text-[17px] font-bold tracking-tight text-slate-900">POOJA ENTERPRISES</span>
          </a>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={enableNotifications}
              className={`relative inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${notificationsEnabled ? 'border-blue-200 text-blue-700' : 'border-slate-200 text-slate-600'}`}
              title={notificationsEnabled ? 'Browser alerts are enabled' : 'Enable browser alerts'}
            >
              <Bell size={15} />
              <span className="hidden sm:inline">{notificationsEnabled ? 'Alerts on' : 'Enable alerts'}</span>
              {dueNotices.length > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white">{dueNotices.length}</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <div className="welcome-banner mb-7 flex items-center justify-between gap-5">
          <div className="relative z-[1]">
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.11em] text-indigo-600"><Sparkles size={12} /> Your personal workspace</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">Make today count.</h1>
            <p className="mt-2 text-sm text-slate-600">A little structure goes a long way. What’s on your list?</p>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="welcome-orbit orbit-one" />
            <div className="welcome-orbit orbit-two" />
            <div className="welcome-sticker sticker-calendar"><CalendarDays size={23} /></div>
            <div className="welcome-sticker sticker-check"><Check size={17} /></div>
            <div className="welcome-sticker sticker-sparkle"><Sparkles size={16} /></div>
          </div>
        </div>

        <section className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" aria-label="Task summary">
          <SummaryCard label="Total tasks" value={summary.total} icon={<CalendarDays size={17} />} tone="blue" />
          <SummaryCard label="Pending" value={summary.pending} icon={<Clock3 size={17} />} tone="amber" />
          <SummaryCard label="Completed" value={summary.completed} icon={<CircleCheck size={17} />} tone="green" />
          <SummaryCard label="Overdue" value={summary.overdue} icon={<Bell size={17} />} tone="rose" />
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,350px)_minmax(0,1fr)] lg:gap-6">
          <section ref={formRef} className="task-form rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><span className="form-heading-icon grid size-7 place-items-center rounded-lg"><Plus size={16} /></span>{editingId ? 'Edit task' : 'Add a task'}</h2>
                <p className="mt-1 text-xs text-slate-500">{editingId ? 'Update your task details.' : 'Capture it now, then focus on what’s next.'}</p>
              </div>
              {editingId && <button type="button" onClick={resetForm} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Cancel editing"><X size={17} /></button>}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Task title <span className="text-rose-500">*</span></span>
                <input
                  ref={titleRef}
                  autoComplete="off"
                  name="title"
                  value={formValues.title}
                  onChange={updateField}
                  placeholder="What needs to get done?"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  aria-invalid={Boolean(formError && !formValues.title.trim())}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span></span>
                <textarea
                  name="description"
                  value={formValues.description}
                  onChange={updateField}
                  rows="3"
                  placeholder="Add a few helpful details..."
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Date</span>
                  <input name="date" type="date" required value={formValues.date} onChange={updateField} className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:px-3 sm:text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Time</span>
                  <input name="time" type="time" required value={formValues.time} onChange={updateField} className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:px-3 sm:text-sm" />
                </label>
              </div>
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-slate-700">Priority</legend>
                <div className="grid grid-cols-3 gap-2">
                  {priorities.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => setFormValues((current) => ({ ...current, priority }))}
                      className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-50 ${formValues.priority === priority ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                      aria-pressed={formValues.priority === priority}
                    >
                      <span className={`size-1.5 rounded-full ${priority.toLowerCase() === 'high' ? 'bg-rose-500' : priority.toLowerCase() === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      {priority}
                    </button>
                  ))}
                </div>
              </fieldset>
              {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{formError}</p>}
              <button type="submit" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
                {editingId ? <Check size={17} /> : <Plus size={17} />}
                {editingId ? 'Save changes' : 'Save task'}
              </button>
            </form>
          </section>

          <section className="task-list-section min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">My tasks<span className="task-count">{tasks.length}</span></h2>
                <p className="mt-1 text-xs text-slate-500">{summary.pending} pending · {summary.overdue} overdue</p>
              </div>
              <label className="flex h-9 min-w-[190px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 shadow-sm transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 sm:max-w-[240px]">
                <Search size={15} />
                <input aria-label="Search tasks by title" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks..." className="w-full min-w-0 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" />
                {search && <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-700" aria-label="Clear search"><X size={14} /></button>}
              </label>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="filter-rail flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Filter tasks">
                {filters.map((item) => (
                  <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 ${filter === item ? 'filter-active bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    {item}{item === 'Today' && <span className="ml-1 text-slate-400">{tasks.filter((task) => task.date === today).length}</span>}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="hidden sm:inline">Sort:</span>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 outline-none focus:border-blue-400">
                  <option>Soonest first</option>
                  <option>Latest first</option>
                </select>
              </label>
            </div>

            <div className="space-y-3">
              {visibleTasks.length > 0 ? visibleTasks.map((task) => (
                <TaskCard key={task.id} task={task} onEdit={() => editTask(task)} onDelete={() => deleteTask(task)} onToggle={() => toggleCompleted(task)} />
              )) : (
                <div className="empty-tasks flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 text-center">
                  <span className="mb-3 grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><CalendarDays size={20} /></span>
                  <h3 className="text-sm font-semibold text-slate-800">{tasks.length === 0 ? 'Your list is a blank canvas' : 'No tasks found'}</h3>
                  <p className="mt-1.5 max-w-xs text-xs leading-5 text-slate-500">{tasks.length === 0 ? 'Add your first task and make the next step easy.' : 'Try a different search or task filter.'}</p>
                  {tasks.length === 0 && <button type="button" onClick={() => titleRef.current?.focus()} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Plus size={14} />Add your first task</button>}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {dueNotices.length > 0 && (
        <aside aria-label="Due task notifications" className="fixed bottom-4 right-4 z-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Bell size={16} className="text-blue-600" />Due now</div>
            <button type="button" onClick={() => setDueNotices([])} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss due notifications"><X size={16} /></button>
          </div>
          <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
            {dueNotices.map((task) => <div key={task.id} className="px-4 py-3"><p className="text-xs font-semibold text-slate-800">{task.title}</p><p className="mt-1 text-[11px] text-slate-500">This task is due now.</p></div>)}
          </div>
        </aside>
      )}

      {toast && <div role="status" className="toast-enter fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"><Check size={15} className="text-emerald-300" />{toast}</div>}
    </div>
  )
}

function SummaryCard({ label, value, icon, tone }) {
  const colors = {
    blue: 'summary-blue',
    amber: 'summary-amber',
    green: 'summary-green',
    rose: 'summary-rose',
  }
  return (
    <div className={`summary-card rounded-xl border p-3.5 shadow-sm sm:p-4 ${colors[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-500 sm:text-xs">{label}</span>
        <span className="summary-icon grid size-8 shrink-0 place-items-center rounded-lg">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:mt-3 sm:text-[26px]">{value}</p>
    </div>
  )
}

function TaskCard({ task, onEdit, onDelete, onToggle }) {
  const status = getStatus(task)
  return (
    <article className={`task-card group rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4.5 ${status === 'Overdue' ? 'task-overdue' : task.completed ? 'task-completed' : `task-priority-${task.priority.toLowerCase()}`}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onToggle} aria-label={task.completed ? 'Mark task as pending' : 'Mark task as completed'} className={`mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full border transition ${task.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-blue-500 hover:text-blue-500'}`}>
          <Check size={12} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`break-words text-sm font-semibold ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</h3>
            <PriorityBadge priority={task.priority} />
          </div>
          {task.description && <p className={`mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 ${task.completed ? 'text-slate-400' : 'text-slate-500'}`}>{task.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`inline-flex items-center gap-1.5 text-[11px] ${status === 'Overdue' ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
              <Clock3 size={13} />{formatDue(task)}
            </span>
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition sm:opacity-70 sm:group-hover:opacity-100">
          <button type="button" onClick={onEdit} aria-label={`Edit ${task.title}`} title="Edit task" className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"><Pencil size={15} /></button>
          <button type="button" onClick={onDelete} aria-label={`Delete ${task.title}`} title="Delete task" className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
        </div>
      </div>
    </article>
  )
}

function PriorityBadge({ priority }) {
  const styles = {
    Low: 'priority-low',
    Medium: 'priority-medium',
    High: 'priority-high',
  }
  return <span className={`priority-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[priority] || styles.Medium}`}><span className={`size-1.5 rounded-full ${priority === 'High' ? 'bg-rose-500' : priority === 'Medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />{priority}</span>
}

function StatusBadge({ status }) {
  const styles = {
    Pending: 'status-pending',
    Completed: 'status-completed',
    Overdue: 'status-overdue',
  }
  return <span className={`status-badge rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>{status}</span>
}

export default App
