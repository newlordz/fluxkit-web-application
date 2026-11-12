import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Check, Info, X } from "lucide-react"

export type NoticeTone = "success" | "info" | "warning" | "error"

type Notice = {
  id: number
  message: string
  tone: NoticeTone
}

export interface NotifyFunction {
  (message: string, tone?: NoticeTone): void
  success: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
  error: (message: string) => void
}

const defaultNotify: NotifyFunction = Object.assign(
  (_message: string, _tone: NoticeTone = "info") => {},
  {
    success: (_msg: string) => {},
    info: (_msg: string) => {},
    warning: (_msg: string) => {},
    error: (_msg: string) => {},
  },
)

const NotificationContext = createContext<NotifyFunction>(defaultNotify)
export const useNotify = () => useContext(NotificationContext)
export default function Notifications({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const counter = useRef(0)
  const notify = useCallback(
    (() => {
      const fn = (message: string, tone: NoticeTone = "info") => {
        const id = ++counter.current
        setNotices((current) => [...current.slice(-2), { id, message, tone }])
        timers.current.push(
          setTimeout(
            () => setNotices((current) => current.filter((n) => n.id !== id)),
            6500,
          ),
        )
      }
      return Object.assign(fn, {
        success: (msg: string) => fn(msg, "success"),
        info: (msg: string) => fn(msg, "info"),
        warning: (msg: string) => fn(msg, "warning"),
        error: (msg: string) => fn(msg, "error"),
      })
    })(),
    [],
  )
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {notices.map((notice) => (
          <div className="toast" key={notice.id}>
            {notice.tone === "success" ? (
              <Check size={18} />
            ) : (
              <Info size={18} />
            )}
            <p>{notice.message}</p>
            <button
              aria-label="Dismiss notification"
              onClick={() =>
                setNotices((current) =>
                  current.filter((n) => n.id !== notice.id),
                )
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}
