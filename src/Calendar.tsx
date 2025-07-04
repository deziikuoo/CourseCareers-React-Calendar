import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import ErrorBoundary from "./ErrorBoundary";
import ThemeToggle from "./ThemeToggle";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isBefore,
  isToday,
  startOfWeek,
  endOfWeek,
  parse,
} from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import FocusLock from "react-focus-lock";
import "./Calendar.css";

interface Event {
  id: string;
  name: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  color: "red" | "blue" | "green";
  date: string;
}

const sortEvents = (a: Event, b: Event): number => {
  if (a.allDay && !b.allDay) return -1;
  if (!a.allDay && b.allDay) return 1;
  if (a.allDay && b.allDay) return 0;
  const [aHour, aMin] = a.startTime.split(" ")[0].split(":").map(Number);
  const [bHour, bMin] = b.startTime.split(" ")[0].split(":").map(Number);
  return aHour * 60 + aMin - (bHour * 60 + bMin);
};

const loadInitialEvents = (): Event[] => {
  try {
    const storedEvents = localStorage.getItem("calendarEvents");
    if (storedEvents) {
      const parsed = JSON.parse(storedEvents);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (e) =>
            "id" in e &&
            typeof e.id === "string" &&
            "date" in e &&
            typeof e.date === "string" &&
            "name" in e &&
            typeof e.name === "string" &&
            "allDay" in e &&
            typeof e.allDay === "boolean" &&
            "color" in e &&
            ["red", "blue", "green"].includes(e.color) &&
            (e.allDay ||
              ("startTime" in e &&
                "endTime" in e &&
                typeof e.startTime === "string" &&
                typeof e.endTime === "string"))
        )
      ) {
        return parsed as Event[];
      } else {
        console.warn(
          "Invalid event data found in LocalStorage, discarding:",
          parsed
        );
      }
    }
  } catch (error) {
    console.error("Error loading events from LocalStorage:", error);
    // Could show a user-friendly notification here
  }
  return [];
};

const to24HourFormat = (time: string): string => {
  if (!time) return "";
  if (/^\d{2}:\d{2}$/.test(time)) return time; // Already in 24-hour format (e.g., "14:30")
  const [hourMinute, period] = time.includes(" ")
    ? time.split(" ")
    : [time, ""];
  if (!hourMinute || !hourMinute.includes(":")) return "";
  const [hourStr, minuteStr] = hourMinute.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10) || 0;
  if (isNaN(hour) || isNaN(minute)) return "";
  if (period) {
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
  }
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
};

const toAmPmFormat = (time: string): string => {
  if (!time) return "";
  if (time.includes("AM") || time.includes("PM")) return time; // Already in AM/PM format
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [hour, minute] = time.split(":").map(Number);
  if (isNaN(hour) || isNaN(minute)) return "";
  const period = hour >= 12 ? "PM" : "AM";
  const adjustedHour = hour % 12 || 12;
  return `${adjustedHour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")} ${period}`;
};

const DAYS_OF_WEEK = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Debounce utility function
const useDebounce = (callback: Function, delay: number) => {
  const timeoutRef = useRef<number>();
  
  return useCallback((...args: any[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = window.setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
};

const Calendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [events, setEvents] = useState<Event[]>(loadInitialEvents);
  const [showModal, setShowModal] = useState(false);
  const [showOverflowModal, setShowOverflowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [overflowEvents, setOverflowEvents] = useState<{
    [key: string]: Event[];
  }>({});
  const [overflowDate, setOverflowDate] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const triggerRef = useRef<HTMLElement | null>(null);

  // Debounced save function to prevent excessive localStorage writes
  const saveEventsToStorage = useCallback((eventsToSave: Event[]) => {
    setSaveStatus('saving');
    try {
      localStorage.setItem("calendarEvents", JSON.stringify(eventsToSave));
      setSaveStatus('saved');
      // Reset to idle after showing saved status
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Failed to save events to localStorage:", error);
      setSaveStatus('error');
      // Reset to idle after showing error status
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, []);

  const debouncedSaveEvents = useDebounce(saveEventsToStorage, 300);

  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  const startDate = useMemo(
    () => startOfWeek(monthStart, { weekStartsOn: 0 }),
    [monthStart]
  );
  const endDate = useMemo(
    () => endOfWeek(monthEnd, { weekStartsOn: 0 }),
    [monthEnd]
  );
  const dateRange = useMemo(
    () => eachDayOfInterval({ start: startDate, end: endDate }),
    [startDate, endDate]
  );
  const weeks = useMemo(() => Math.ceil(dateRange.length / 7), [dateRange]);

  useEffect(() => {
    debouncedSaveEvents(events);
  }, [events, debouncedSaveEvents]);

  const calculateOverflowEvents = useCallback(() => {
    const maxVisibleEvents = 3;
    const newOverflowEvents: { [key: string]: Event[] } = {};
    dateRange.forEach((day) => {
      const dateString = format(day, "yyyy-MM-dd");
      const dayEvents = events.filter((event) => event.date === dateString);
      if (dayEvents.length > maxVisibleEvents) {
        newOverflowEvents[dateString] = dayEvents.slice(maxVisibleEvents);
      }
    });
    setOverflowEvents(newOverflowEvents);
  }, [dateRange, events]);

  useEffect(() => {
    calculateOverflowEvents();
    const handleResize = () => calculateOverflowEvents();
    const debouncedResize = setTimeout(
      () => window.addEventListener("resize", handleResize),
      200
    );
    return () => {
      clearTimeout(debouncedResize);
      window.removeEventListener("resize", handleResize);
    };
  }, [calculateOverflowEvents, showModal, showOverflowModal]);

  const goToPreviousMonth = useCallback(
    () => setCurrentDate((prev) => subMonths(prev, 1)),
    []
  );
  const goToNextMonth = useCallback(
    () => setCurrentDate((prev) => addMonths(prev, 1)),
    []
  );
  const goToCurrentMonth = useCallback(() => setCurrentDate(new Date()), []);

  const openModal = useCallback((date: Date, trigger?: HTMLElement) => {
    if (trigger) triggerRef.current = trigger;
    setSelectedDate(date);
    setSelectedEvent(null);
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((event: Event, trigger?: HTMLElement) => {
    const eventDate = parse(event.date, "yyyy-MM-dd", new Date());
    if (trigger) triggerRef.current = trigger; // Store the event button from OverflowModal
    setSelectedEvent(event);
    setSelectedDate(eventDate);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setSelectedDate(null);
    setSelectedEvent(null);
  }, []);

  const openOverflowModal = useCallback(
    (date: string, trigger?: HTMLElement) => {
      if (trigger) triggerRef.current = trigger;
      setOverflowDate(date);
      setShowOverflowModal(true);
    },
    []
  );

  const closeOverflowModal = useCallback(() => {
    setShowOverflowModal(false);
    setOverflowDate(null);
  }, []);

  const handleAddEvent = useCallback(
    (newEvent: Event) => {
      setEvents((prev) => [...prev, newEvent].sort(sortEvents));
      closeModal();
    },
    [closeModal]
  );

  const handleEditEvent = useCallback(
    (updatedEvent: Event) => {
      setEvents((prev) =>
        prev
          .map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
          .sort(sortEvents)
      );
      closeModal();
    },
    [closeModal]
  );

  const handleDeleteEvent = useCallback(
    (eventId: string) => {
      setEvents((prev) => prev.filter((event) => event.id !== eventId));
      closeModal();
    },
    [closeModal]
  );

  const restoreFocus = useCallback(() => {
    triggerRef.current?.focus();
  }, []);

  const renderDay = useCallback(
    (day: Date, index: number) => {
      const dateString = format(day, "yyyy-MM-dd");
      const dayEvents = events.filter((event) => event.date === dateString);
      const isCurrentMonth = isSameMonth(day, currentDate);
      const isPastDate = isBefore(day, new Date()) && !isToday(day);
      const isTodayDate = isToday(day);

      const handleDayClick = (e: React.MouseEvent) => {
        // Only trigger if clicking the day container itself, not events
        if (e.target === e.currentTarget || (e.target as Element).closest('.day-header')) {
          openModal(day, e.currentTarget as HTMLElement);
        }
      };

      return (
        <div
          key={dateString}
          className={`calendar-day ${isCurrentMonth ? "" : "other-month"} ${
            isPastDate ? "past-date" : ""
          } ${isTodayDate ? "today" : ""}`}
          data-date={dateString}
          role="gridcell"
          aria-label={`${format(day, "MMMM d, yyyy")}${
            isTodayDate ? ", Today" : ""
          }${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}. Click to add event.`}
          aria-selected={isTodayDate}
          onClick={handleDayClick}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openModal(day, e.currentTarget);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              const nextDay = e.currentTarget.nextElementSibling as HTMLElement;
              if (nextDay && nextDay.classList.contains("calendar-day")) {
                nextDay.focus();
              }
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              const prevDay = e.currentTarget.previousElementSibling as HTMLElement;
              if (prevDay && prevDay.classList.contains("calendar-day")) {
                prevDay.focus();
              }
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const currentIndex = Array.from(e.currentTarget.parentElement?.children || []).indexOf(e.currentTarget);
              const nextWeekDay = e.currentTarget.parentElement?.children[currentIndex + 7] as HTMLElement;
              if (nextWeekDay && nextWeekDay.classList.contains("calendar-day")) {
                nextWeekDay.focus();
              }
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const currentIndex = Array.from(e.currentTarget.parentElement?.children || []).indexOf(e.currentTarget);
              const prevWeekDay = e.currentTarget.parentElement?.children[currentIndex - 7] as HTMLElement;
              if (prevWeekDay && prevWeekDay.classList.contains("calendar-day")) {
                prevWeekDay.focus();
              }
            }
          }}
        >
          <div className="day-header">
            {index < 7 && (
              <span className="day-of-week" aria-hidden="true">{DAYS_OF_WEEK[index]}</span>
            )}
            <span className="date-number" aria-hidden="true">{format(day, "d")}</span>
            <button
              className="addEvent-button desktop-only"
              onClick={(e) => {
                e.stopPropagation(); // Prevent day click
                openModal(day, e.currentTarget);
              }}
              aria-label={`Add event on ${format(day, "MMMM d, yyyy")}`}
            >
              +
            </button>
          </div>
          <div className="events-container">
            {dayEvents.slice(0, 3).map((event) => (
              <button
                key={event.id}
                className={`event ${event.allDay ? "all-day" : "timed"} ${
                  event.color
                }`}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent day click
                  openEditModal(event, e.currentTarget);
                }}
                aria-label={
                  event.allDay
                    ? `${event.name}, All day event`
                    : `${event.name}, From ${event.startTime || "N/A"} to ${
                        event.endTime || "N/A"
                      }`
                }
              >
                {event.allDay ? (
                  event.name
                ) : (
                  <>
                    <span
                      className={`event-dot ${event.color}`}
                      aria-hidden="true"
                    />
                    {`${event.startTime || "N/A"} - ${event.endTime || "N/A"} ${
                      event.name
                    }`}
                  </>
                )}
              </button>
            ))}
            {dayEvents.length > 3 && (
              <button
                className="overflow-button"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent day click
                  openOverflowModal(dateString, e.currentTarget);
                }}
                aria-label={`Show ${
                  dayEvents.length - 3
                } more events on ${format(day, "MMMM d, yyyy")}`}
              >
                +{dayEvents.length - 3} More
              </button>
            )}
          </div>
        </div>
      );
    },
    [events, currentDate, openModal, openEditModal, openOverflowModal]
  );

  const renderCalendar = useMemo(
    () => dateRange.map(renderDay),
    [dateRange, renderDay]
  );

  const gridStyles = useMemo(
    () => ({ gridTemplateRows: `repeat(${weeks}, 1fr)` }),
    [weeks]
  );

  const overflowModalEvents = useMemo(
    () =>
      overflowDate
        ? events.filter((event) => event.date === overflowDate) // Filter all events for the date
        : [],
    [overflowDate, events]
  );

  const CalendarErrorFallback = () => (
    <div className="calendar-error-fallback">
      <div className="error-content">
        <div className="error-icon">📅</div>
        <h3>Calendar Error</h3>
        <p>There was an issue loading the calendar. Your events are safe.</p>
        <button 
          onClick={() => window.location.reload()} 
          className="retry-button"
        >
          Reload Calendar
        </button>
      </div>
    </div>
  );

  return (
    <ErrorBoundary fallback={<CalendarErrorFallback />}>
      <div className="calendar-container">
      <div className="calendar-header">
        <button 
          id="todayButton" 
          onClick={goToCurrentMonth}
          aria-label="Go to current month"
        >
          Today
        </button>
        <h2 id="current-month-year">{format(currentDate, "MMMM yyyy")}</h2>
        <div className="save-status" aria-live="polite">
          {saveStatus === 'saving' && <span className="saving">Saving...</span>}
          {saveStatus === 'saved' && <span className="saved">✓ Saved</span>}
          {saveStatus === 'error' && <span className="error">⚠ Save failed</span>}
        </div>
        <div className="calendar-nav" role="navigation" aria-label="Calendar navigation">
          <button 
            onClick={goToPreviousMonth} 
            aria-label="Go to previous month"
            aria-describedby="current-month-year"
          >
            {"<"}
          </button>
          <button 
            onClick={goToNextMonth} 
            aria-label="Go to next month"
            aria-describedby="current-month-year"
          >
            {">"}
          </button>
        </div>
        <ThemeToggle />
      </div>
      <div
        id="calendar-grid"
        className="calendar-grid"
        style={gridStyles}
        role="grid"
        aria-label={`Calendar for ${format(currentDate, "MMMM yyyy")}`}
        aria-describedby="calendar-instructions"
      >
        <div id="calendar-instructions" className="sr-only">
          Use Tab to navigate between days. Press Enter or Space to add an event to the selected day. 
          Use arrow keys to move between months. Today's date is highlighted.
        </div>
        {renderCalendar}
      </div>
      <AnimatePresence mode="wait" onExitComplete={restoreFocus}>
        {showOverflowModal && overflowDate && (
          <OverflowModal
            date={overflowDate}
            events={overflowModalEvents} // Pass all events for the date
            onClose={closeOverflowModal}
            onEditEvent={openEditModal}
          />
        )}
        {showModal && selectedDate && (
          <Modal
            selectedDate={selectedDate}
            selectedEvent={selectedEvent}
            onClose={closeModal}
            onAddEvent={handleAddEvent}
            onEditEvent={handleEditEvent}
            onDeleteEvent={handleDeleteEvent}
          />
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
};

interface ModalProps {
  selectedDate: Date;
  selectedEvent: Event | null;
  onClose: () => void;
  onAddEvent: (event: Event) => void;
  onEditEvent: (event: Event) => void;
  onDeleteEvent: (eventId: string) => void;
}

const Modal: React.FC<ModalProps> = ({
  selectedDate,
  selectedEvent,
  onClose,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}) => {
  const [name, setName] = useState(selectedEvent?.name || "");
  const [allDay, setAllDay] = useState(selectedEvent?.allDay || false);
  const [startTime, setStartTime] = useState(selectedEvent?.startTime || "");
  const [endTime, setEndTime] = useState(selectedEvent?.endTime || "");
  const [color, setColor] = useState<"red" | "blue" | "green">(
    selectedEvent?.color || "blue"
  );
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // Stop Esc event before reaching OverflowModal
        onClose(); // Close Modal fully
      }
    },
    [onClose]
  );

  useEffect(() => {
    setName(selectedEvent?.name || "");
    setAllDay(selectedEvent?.allDay || false);
    setStartTime(
      selectedEvent?.startTime ? to24HourFormat(selectedEvent.startTime) : ""
    );
    setEndTime(
      selectedEvent?.endTime ? to24HourFormat(selectedEvent.endTime) : ""
    );
    setColor(selectedEvent?.color || "blue");
    setError(null);
  }, [selectedEvent]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name) {
        setError("Event name is required.");
        return;
      }
      if (!allDay) {
        if (
          !startTime ||
          !endTime ||
          !/^\d{2}:\d{2}$/.test(startTime) ||
          !/^\d{2}:\d{2}$/.test(endTime)
        ) {
          setError("Invalid time format. Use HH:MM.");
          return;
        }
        const start = startTime.split(":").map(Number);
        const end = endTime.split(":").map(Number);
        if (isNaN(start[0]) || isNaN(end[0])) {
          setError("Invalid time values.");
          return;
        }
        const startMinutes = start[0] * 60 + start[1];
        const endMinutes = end[0] * 60 + end[1];
        if (startMinutes >= endMinutes) {
          setError("Start time must be before end time.");
          return;
        }
      }

      const event: Event = {
        id: selectedEvent?.id || Date.now().toString(),
        name,
        allDay,
        startTime: allDay ? "" : toAmPmFormat(startTime),
        endTime: allDay ? "" : toAmPmFormat(endTime),
        color,
        date: format(selectedDate, "yyyy-MM-dd"),
      };

      if (selectedEvent) {
        onEditEvent(event);
      } else {
        onAddEvent(event);
      }
    },
    [
      name,
      allDay,
      startTime,
      endTime,
      color,
      selectedDate,
      selectedEvent,
      onAddEvent,
      onEditEvent,
    ]
  );
  [
    name,
    allDay,
    startTime,
    endTime,
    color,
    selectedDate,
    selectedEvent,
    onAddEvent,
    onEditEvent,
  ];

  const handleCheckboxKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setAllDay((prev) => !prev);
      }
    },
    []
  );

  return (
    <FocusLock returnFocus={false}>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal"
          data-modal-type="edit"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          role="dialog"
          aria-labelledby="modal-title"
          aria-describedby="modal-description"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <div id="modal-description" className="sr-only">
            {selectedEvent ? "Edit event details" : "Add a new event to your calendar"}
          </div>
          <h2 id="modal-title">
            {selectedEvent ? "Edit Event" : "Add Event"}{" "}
            {format(selectedDate, "M/d/yy")}
          </h2>
          {error && (
            <div
              className="error-message"
              id="form-error"
              aria-live="assertive"
              role="alert"
            >
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="event-name">Event Name *</label>
              <input
                id="event-name"
                type="text"
                placeholder="Enter event name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                aria-describedby={error ? "form-error" : undefined}
                aria-invalid={error ? "true" : "false"}
              />
            </div>
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  id="all-day-checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  onKeyDown={handleCheckboxKeyDown}
                  aria-describedby="all-day-description"
                />
                <span>All Day</span>
              </label>
              <div id="all-day-description" className="sr-only">
                Check this box if the event lasts all day
              </div>
              {!allDay && (
                <div className="time-inputs">
                  <div>
                    <label htmlFor="start-time">Start Time *</label>
                    <input
                      id="start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                      aria-describedby={error ? "form-error" : undefined}
                      aria-invalid={error ? "true" : "false"}
                    />
                  </div>
                  <div>
                    <label htmlFor="end-time">End Time *</label>
                    <input
                      id="end-time"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                      aria-describedby={error ? "form-error" : undefined}
                      aria-invalid={error ? "true" : "false"}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="form-group color-picker">
              <label id="color-label">Event Color</label>
              <div
                className="color-options"
                role="radiogroup"
                aria-labelledby="color-label"
                aria-describedby="color-description"
              >
                {(["red", "blue", "green"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-option ${c} ${
                      color === c ? "selected" : ""
                    }`}
                    onClick={() => setColor(c)}
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`${
                      c.charAt(0).toUpperCase() + c.slice(1)
                    } color${color === c ? ', selected' : ''}`}
                  />
                ))}
              </div>
              <div id="color-description" className="sr-only">
                Choose a color to organize your events. Red for urgent, blue for work, green for personal.
              </div>
            </div>
            <div className="form-actions">
              <button type="submit">{selectedEvent ? "Update" : "Add"}</button>
              {selectedEvent && (
                <button
                  type="button"
                  onClick={() => onDeleteEvent(selectedEvent.id)}
                  className="delete-button"
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </motion.div>
      </motion.div>
    </FocusLock>
  );
};

interface OverflowModalProps {
  date: string;
  events: Event[]; // This will now be all events, passed from the parent
  onClose: () => void;
  onEditEvent: (event: Event, trigger?: HTMLElement) => void;
}

const OverflowModal: React.FC<OverflowModalProps> = ({
  date,
  events,
  onClose,
  onEditEvent,
}) => {
  const handleEventClick = useCallback(
    (event: Event, trigger: HTMLElement) => onEditEvent(event, trigger),
    [onEditEvent]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  return (
    <FocusLock returnFocus={false}>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal"
          data-modal-type="overflow"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          role="dialog"
          aria-labelledby="modal-title"
          aria-describedby="overflow-description"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <div id="overflow-description" className="sr-only">
            Events for this day. Click on any event to edit it.
          </div>
          <h2 id="modal-title">
            {format(parse(date, "yyyy-MM-dd", new Date()), "M/d/yy")}
          </h2>
          <div className="events-container">
            {events.map((event, index) => (
              <button
                key={event.id}
                className={`event ${event.allDay ? "all-day" : "timed"} ${
                  event.color
                }`}
                onClick={(e) => handleEventClick(event, e.currentTarget)}
                aria-label={
                  event.allDay
                    ? `${event.name}, All day event`
                    : `${event.name}, Starts at ${event.startTime}`
                }
                autoFocus={index === 0}
              >
                {event.allDay ? (
                  event.name
                ) : (
                  <>
                    <span
                      className={`event-dot ${event.color}`}
                      aria-hidden="true"
                    />
                    {`${event.startTime} ${event.name}`}
                  </>
                )}
              </button>
            ))}
          </div>
          <button className="close-button" onClick={onClose}>
            Close
          </button>
        </motion.div>
      </motion.div>
    </FocusLock>
  );
};

export default Calendar;
