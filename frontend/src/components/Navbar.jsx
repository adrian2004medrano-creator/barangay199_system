import { Bell, Search, LogOut, Menu, X, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";

function readCachedProfile() {
  try {
    return JSON.parse(localStorage.getItem("barangay199_user") || "null");
  } catch {
    return null;
  }
}

function playNotificationSound(audioContext) {
  if (!audioContext || audioContext.state !== "running") return;

  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  } catch {
    // Ignore audio errors so notification updates still work.
  }
}

export default function Navbar({ onToggleSidebar }) {
  const navigate = useNavigate();
  const [clientName, setClientName] = useState("");
  const [clientResults, setClientResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState(readCachedProfile);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const audioContextRef = useRef(null);
  const knownNotificationIdsRef = useRef(null);
  const role = user?.role || localStorage.getItem("barangay199_role") || "user";
  const roleNames = { superadmin: "Barangay Captain", admin: "Barangay Official", user: "Resident" };
  const roleLabel = user?.position || roleNames[role] || role.replaceAll("_", " ");
  const initials = `${user?.first_name?.split(/\s+/).map((part) => part[0]).join("") || "S"}${user?.last_name?.[0] || ""}`.slice(0, 3).toUpperCase();
  const profileImage = user?.profile_picture
    ? new URL(user.profile_picture, api.defaults.baseURL).href
    : "";

  const applyNotificationData = (data) => {
    const latestNotifications = data.notifications || [];
    const knownIds = knownNotificationIdsRef.current;
    const hasNewUnread = knownIds && latestNotifications.some((notification) => (
      !knownIds.has(notification.id) && !notification.read_at
    ));
    if (hasNewUnread) playNotificationSound(audioContextRef.current);
    knownNotificationIdsRef.current = new Set(latestNotifications.map((notification) => notification.id));
    setNotifications(latestNotifications);
    setUnreadCount(Number(data.unread_count) || 0);
  };

  useEffect(() => {
    const unlockAudio = () => {
      if (!audioContextRef.current) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) return;
        audioContextRef.current = new AudioContextConstructor();
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/me")
      .then(({ data }) => {
        if (cancelled) return;
        localStorage.setItem("barangay199_user", JSON.stringify(data));
        setUser(data);
      })
      .catch(() => {});

    const syncProfile = () => setUser(readCachedProfile());
    window.addEventListener("profile-updated", syncProfile);
    return () => {
      cancelled = true;
      window.removeEventListener("profile-updated", syncProfile);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshNotifications = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (!cancelled) {
          applyNotificationData(data);
        }
      } catch {
        // Notifications are optional until the backend is available.
      }
    };

    refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const name = clientName.trim();
    if (name.length < 2) {
      setClientResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    const timeoutId = window.setTimeout(() => {
      api.get("/search/residents", { params: { name } })
        .then((response) => {
          if (!cancelled) setClientResults(response.data || []);
        })
        .catch(() => {
          if (!cancelled) setClientResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [clientName]);

  const handleLogout = () => {
    localStorage.removeItem("barangay199_auth");
    localStorage.removeItem("barangay199_role");
    localStorage.removeItem("barangay199_token");
    localStorage.removeItem("barangay199_user");
    navigate("/login", { replace: true });
  };

  const handleNotificationsToggle = async () => {
    const shouldOpen = !notificationsOpen;
    setNotificationsOpen(shouldOpen);
    if (!shouldOpen) return;

    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const { data } = await api.get("/notifications");
      applyNotificationData(data);
      const latestNotifications = data.notifications || [];
      if (Number(data.unread_count) > 0) {
        await api.put("/notifications/read");
        const readAt = new Date().toISOString();
        setNotifications(latestNotifications.map((notification) => ({ ...notification, read_at: notification.read_at || readAt })));
        setUnreadCount(0);
      }
    } catch (err) {
      setNotificationsError(err?.response?.data?.message || "Could not load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleNotificationDelete = async (notification) => {
    setNotificationsError("");
    try {
      await api.delete(`/notifications/${notification.id}`);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      if (!notification.read_at) setUnreadCount((current) => Math.max(0, current - 1));
    } catch (err) {
      setNotificationsError(err?.response?.data?.message || "Could not delete notification.");
    }
  };

  const handleNotificationOpen = (notification) => {
    setNotificationsOpen(false);
    if (notification.message.startsWith("New private message")) {
      navigate("/team-chat", { state: { chatMode: "private", recipientId: notification.actor_id } });
    } else {
      navigate("/team-chat");
    }
  };

  const isChatNotification = (notification) => (
    notification.message.startsWith("New team chat message")
    || notification.message.startsWith("New private message")
  );

  return (
    <header className="sticky top-0 z-20 flex min-h-[88px] items-center justify-between gap-3 border-b border-[#e2e5e8] bg-white px-3 sm:px-6 lg:px-9">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e3e6e9] bg-white text-[#34383c] md:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar navigation"
        >
          <Menu size={18} />
        </button>

        <div className="flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
          <img src="/barangay199-logo.jpg" alt="Barangay 199 official seal" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[12px] font-semibold leading-tight text-[#22272b] sm:text-[17px]">BARANGAY 199 <span className="font-normal text-[#a4aab0]">|</span> INFORMATION SYSTEM</h1>
          <p className="mt-1 truncate text-[9px] font-medium uppercase tracking-[0.1em] text-[#78818a] sm:text-[11px]">Barangay 199 Portal</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="relative hidden lg:block">
          <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3.5 py-2 focus-within:border-primary">
            <Search size={16} className="text-muted" />
            <input
              type="search"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search resident name..."
              aria-label="Search by resident name"
              aria-expanded={searchOpen && clientName.trim().length >= 2}
              className="w-44 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          {searchOpen && clientName.trim().length >= 2 && (
            <div className="absolute right-0 top-full z-30 mt-2 max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-ink/10 bg-white p-2 shadow-card">
              {searching ? (
                <p className="px-3 py-4 text-sm text-muted">Searching resident names...</p>
              ) : clientResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted">No residents found with that name.</p>
              ) : clientResults.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setClientName("");
                    setSearchOpen(false);
                    navigate(`/residents/${client.id}`);
                  }}
                  className="block w-full rounded-lg px-3 py-3 text-left hover:bg-surface"
                >
                  <span className="block text-sm font-semibold text-ink900">{client.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">Age {client.age ?? "not recorded"} · {client.purok || "No purok recorded"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={handleNotificationsToggle}
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            aria-expanded={notificationsOpen}
            aria-controls="notifications-panel"
            className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[#e3e6e9] bg-white transition-colors hover:bg-[#f7f8f9] sm:h-10 sm:w-10"
          >
            <Bell size={17} className="text-ink900" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-risk px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <section id="notifications-panel" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-[#e3e6e9] bg-white shadow-card sm:w-96">
              <div className="flex items-center justify-between border-b border-[#e3e6e9] px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#292e33]">Notifications</h2>
                  <p className="mt-0.5 text-xs text-[#78818a]">Recent system activity</p>
                </div>
                <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications" className="flex h-8 w-8 items-center justify-center rounded-md text-[#78818a] hover:bg-[#f3f4f5] hover:text-[#30353a]">
                  <X size={16} />
                </button>
              </div>

              {notificationsError && <p role="alert" className="m-3 rounded-md bg-risk-light px-3 py-2 text-xs text-risk">{notificationsError}</p>}
              <div className="max-h-[min(65vh,26rem)] overflow-y-auto">
                {notificationsLoading ? (
                  <p className="px-4 py-8 text-center text-sm text-[#78818a]">Loading notifications...</p>
                ) : notifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-[#78818a]">No notifications yet.</p>
                ) : (
                  <ul className="divide-y divide-[#eef0f2]">
                    {notifications.map((notification) => (
                      <li key={notification.id} className={`flex items-start gap-3 px-4 py-3 ${notification.read_at ? "bg-white" : "bg-[#f7f9fa]"}`}>
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? "bg-transparent" : "bg-risk"}`} />
                        <div className="min-w-0 flex-1">
                          {isChatNotification(notification) ? (
                            <button type="button" onClick={() => handleNotificationOpen(notification)} className="text-left text-sm leading-snug text-[#343a40] hover:text-primary">
                              {notification.message}
                            </button>
                          ) : (
                            <p className="text-sm leading-snug text-[#343a40]">{notification.message}</p>
                          )}
                          <p className="mt-1 text-xs text-[#88919a]">{new Date(notification.created_at).toLocaleString()}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleNotificationDelete(notification)}
                          aria-label={`Delete notification: ${notification.message}`}
                          title="Delete notification"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#88919a] transition-colors hover:bg-risk-light hover:text-risk"
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/profile")}
          aria-label="Open your profile settings"
          title="Edit profile"
          className="flex min-w-0 items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-[#f3f4f5] focus-visible:outline-offset-1"
        >
          {profileImage ? (
            <img src={profileImage} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light font-display text-xs font-semibold text-primary-dark">
              {initials}
            </span>
          )}
          <div className="hidden lg:block leading-tight">
            <p className="max-w-40 truncate text-sm font-semibold text-ink900">{user ? [user.first_name, user.middle_initial, user.last_name].filter(Boolean).join(" ") : "User Account"}</p>
            <p className="text-xs capitalize text-muted">{roleLabel}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#747d85] transition-colors hover:bg-[#f3f4f5] hover:text-risk sm:h-10 sm:w-10"
          title="Log out"
        >
          <LogOut size={17} />
        </button>

        <div className="hidden min-w-[142px] items-center gap-3 rounded-[10px] border border-[#e3e6e9] bg-[#fafbfc] px-3.5 py-2 sm:flex">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22b85a] shadow-[0_0_0_4px_rgba(34,184,90,0.1)]" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tabular-nums text-[#292e33]">
              {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[#8a939b]">
              {currentTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" })}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
