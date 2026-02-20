import { useEffect, useState } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  MapPin,
  Ticket,
  Check,
  X,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface EventItem {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  ticket_url: string | null;
  description: string | null;
  cast_members: string[];
  event_type: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  generated_posts: Array<{
    auto_template: string;
    status: string;
    id: string;
  }>;
}

interface EventForm {
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  ticket_url: string;
  description: string;
  cast_members: string;
  event_type: string;
  is_active: boolean;
}

const EMPTY_FORM: EventForm = {
  title: "",
  date: "",
  time: "20:00",
  venue: "",
  city: "",
  ticket_url: "",
  description: "",
  cast_members: "",
  event_type: "standard",
  is_active: true,
};

const TEMPLATE_LABELS: Record<string, string> = {
  announcement: "Ankündigung",
  countdown: "Countdown",
  reminder: "Reminder",
  thankyou: "Danke",
};

export default function EventsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) loadEvents();
  }, [user]);

  const loadEvents = async () => {
    try {
      const data = await apiGet<EventItem[]>("/api/events");
      setEvents(data || []);
    } catch (error: any) {
      toast.error("Fehler beim Laden: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingEvent(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (event: EventItem) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      date: event.date,
      time: event.time || "20:00",
      venue: event.venue,
      city: event.city,
      ticket_url: event.ticket_url || "",
      description: event.description || "",
      cast_members: (event.cast_members || []).join(", "),
      event_type: event.event_type || "standard",
      is_active: event.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.date || !form.venue || !form.city) {
      toast.error("Titel, Datum, Venue und Stadt sind Pflichtfelder");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        date: form.date,
        time: form.time || "20:00",
        venue: form.venue,
        city: form.city,
        ticket_url: form.ticket_url || null,
        description: form.description || null,
        cast_members: form.cast_members
          ? form.cast_members.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        event_type: form.event_type || "standard",
        is_active: form.is_active,
      };

      if (editingEvent) {
        await apiPatch(`/api/events/${editingEvent.id}`, payload);
        toast.success("Event aktualisiert");
      } else {
        await apiPost("/api/events", payload);
        toast.success("Event erstellt");
      }

      setDialogOpen(false);
      loadEvents();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/events/${id}`);
      toast.success("Event gelöscht");
      loadEvents();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    }
  };

  const handleToggleActive = async (event: EventItem) => {
    try {
      await apiPatch(`/api/events/${event.id}`, {
        is_active: !event.is_active,
      });
      loadEvents();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    }
  };

  const getTemplateStatus = (event: EventItem, template: string) => {
    return event.generated_posts?.some((p) => p.auto_template === template);
  };

  if (loading) {
    return (
      <GlobalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </GlobalLayout>
    );
  }

  return (
    <GlobalLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {events.length}
            </Badge>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Neues Event
          </Button>
        </div>

        {/* Event Grid */}
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Noch keine Events angelegt.</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              Erstes Event erstellen
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {events.map((event) => {
              const eventDate = new Date(event.date + "T00:00:00");
              const isPast = eventDate < new Date() && !isToday(eventDate);

              return (
                <Card
                  key={event.id}
                  className={`glass-card group transition-all hover:shadow-lg ${
                    isPast ? "opacity-60" : ""
                  } ${!event.is_active ? "border-dashed border-muted-foreground/30" : ""}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base font-semibold truncate">
                          {event.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          <span>
                            {format(eventDate, "EEEE, d. MMMM yyyy", { locale: de })}
                          </span>
                          <span className="text-xs">
                            {event.time?.substring(0, 5) || "20:00"} Uhr
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(event)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-destructive"
                          onClick={() => handleDelete(event.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Location */}
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>
                        {event.venue}, {event.city}
                      </span>
                    </div>

                    {/* Ticket Link */}
                    {event.ticket_url && (
                      <div className="flex items-center gap-2 text-sm">
                        <Ticket className="h-3.5 w-3.5 text-muted-foreground" />
                        <a
                          href={event.ticket_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate"
                        >
                          Tickets
                        </a>
                      </div>
                    )}

                    {/* Cast */}
                    {event.cast_members?.length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">
                          {event.cast_members.join(", ")}
                        </span>
                      </div>
                    )}

                    {/* Active Toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">Aktiv</span>
                      <Switch
                        checked={event.is_active}
                        onCheckedChange={() => handleToggleActive(event)}
                      />
                    </div>

                    {/* Auto-Post Templates Status */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(TEMPLATE_LABELS).map(([key, label]) => {
                        const hasPost = getTemplateStatus(event, key);
                        return (
                          <Badge
                            key={key}
                            variant={hasPost ? "default" : "outline"}
                            className={`text-[10px] px-1.5 py-0 ${
                              hasPost
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : "text-muted-foreground/50 border-border/50"
                            }`}
                          >
                            {hasPost ? (
                              <Check className="h-2.5 w-2.5 mr-0.5" />
                            ) : (
                              <X className="h-2.5 w-2.5 mr-0.5" />
                            )}
                            {label}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Event bearbeiten" : "Neues Event"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="z.B. Pater Brown – Das Live-Hörspiel"
                className="glass-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="date">Datum *</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Uhrzeit</Label>
                <Input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="glass-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="venue">Venue *</Label>
                <Input
                  id="venue"
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                  placeholder="z.B. Alte Kongresshalle"
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Stadt *</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="z.B. München"
                  className="glass-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket_url">Ticket-Link</Label>
              <Input
                id="ticket_url"
                value={form.ticket_url}
                onChange={(e) =>
                  setForm({ ...form, ticket_url: e.target.value })
                }
                placeholder="https://..."
                className="glass-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Kurzbeschreibung des Events"
                className="glass-input min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cast_members">Cast (kommagetrennt)</Label>
              <Input
                id="cast_members"
                value={form.cast_members}
                onChange={(e) =>
                  setForm({ ...form, cast_members: e.target.value })
                }
                placeholder="z.B. Antoine Monot, Wanja Mues, Marvelin"
                className="glass-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event_type">Event-Typ</Label>
              <Input
                id="event_type"
                value={form.event_type}
                onChange={(e) =>
                  setForm({ ...form, event_type: e.target.value })
                }
                placeholder="z.B. standard, eigenveranstaltung, inthega_tournee"
                className="glass-input"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Aktiv</Label>
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(checked) =>
                  setForm({ ...form, is_active: checked })
                }
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {editingEvent ? "Speichern" : "Erstellen"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </GlobalLayout>
  );
}

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}
