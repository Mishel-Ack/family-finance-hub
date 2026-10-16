import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/auth-context";
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTypes,
  updateNotificationPreference,
  type NotificationPreferenceType,
} from "@/services/notifications";

const preferenceLabels: Record<NotificationPreferenceType, string> = {
  PURCHASE_REQUEST: "Purchase requests",
  PURCHASE_DECISION: "Purchase decisions",
  BUDGET_ALERT: "Budget alerts",
  RECURRING_REMINDER: "Recurring bill reminders",
  INSIGHT: "Financial insights",
  FAMILY_UPDATE: "Family updates",
  MONTHLY_STORY_READY: "Monthly money stories",
  FUND_OFF_TRACK: "Sinking fund alerts",
  ANOMALY: "Unusual spending",
  MEMBER_JOINED: "Member updates",
  SETTLEMENT: "Settlement updates",
};

export function NotificationCenter() {
  const { family, user } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ["notifications", family?.id, user?.id],
    queryFn: listNotifications,
    enabled: Boolean(family?.id && user?.id),
    refetchInterval: 60_000,
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: getNotificationPreferences,
    enabled: Boolean(user?.id && open && preferencesOpen),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications", family?.id, user?.id] }),
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications", family?.id, user?.id] }),
  });
  const updatePreference = useMutation({
    mutationFn: updateNotificationPreference,
    onSuccess: () => client.invalidateQueries({ queryKey: ["notification-preferences", user?.id] }),
  });
  return (
    <div className="fixed right-4 top-16 z-50 print:hidden lg:right-6 lg:top-6">
      <Button
        variant="outline"
        size="icon"
        aria-label={`Notifications${notifications.data?.unreadCount ? `, ${notifications.data.unreadCount} unread` : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-4 w-4" />
        {Boolean(notifications.data?.unreadCount) && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-xs text-destructive-foreground">
            {notifications.data?.unreadCount}
          </span>
        )}
      </Button>
      {open && (
        <Card className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {preferencesOpen ? "Notification preferences" : "Notifications"}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPreferencesOpen((value) => !value)}
              >
                {preferencesOpen ? "Back" : "Preferences"}
              </Button>
              {!preferencesOpen ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!notifications.data?.unreadCount || markAll.isPending}
                  onClick={() => markAll.mutate()}
                >
                  Mark all read
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto">
            {preferencesOpen ? (
              preferences.isLoading ? (
                <p>Loading preferences…</p>
              ) : preferences.isError ? (
                <p role="alert">Could not load notification preferences.</p>
              ) : (
                <>
                  {notificationTypes.map((type) => (
                    <div
                      key={type}
                      className="flex items-center justify-between gap-3 border-b py-2 last:border-0"
                    >
                      <Label htmlFor={`notification-${type}`} className="text-sm">
                        {preferenceLabels[type]}
                      </Label>
                      <Switch
                        id={`notification-${type}`}
                        checked={
                          preferences.data?.find((preference) => preference.type === type)?.inApp ??
                          true
                        }
                        disabled={updatePreference.isPending}
                        onCheckedChange={(inApp) => updatePreference.mutate({ type, inApp })}
                      />
                    </div>
                  ))}
                  {updatePreference.isError ? (
                    <p role="alert" className="text-sm text-destructive">
                      Could not save this preference.
                    </p>
                  ) : null}
                </>
              )
            ) : notifications.isLoading ? (
              <p>Loading…</p>
            ) : notifications.isError ? (
              <p role="alert">Could not load notifications.</p>
            ) : (notifications.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">You’re all caught up.</p>
            ) : (
              (notifications.data?.items ?? []).map((item) => (
                <button
                  key={item.id}
                  className={`block w-full rounded-md border p-3 text-left ${item.readAt ? "opacity-70" : "bg-muted/40"}`}
                  onClick={() => {
                    if (!item.readAt) markRead.mutate(item.id);
                  }}
                >
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{item.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("en-IN")}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
