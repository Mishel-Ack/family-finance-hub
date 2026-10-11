import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/auth-context";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";

export function NotificationCenter() {
  const { family } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ["notifications", family?.id],
    queryFn: listNotifications,
    enabled: Boolean(family?.id),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications", family?.id] }),
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications", family?.id] }),
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
            <CardTitle className="text-base">Notifications</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              disabled={!notifications.data?.unreadCount || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          </CardHeader>
          <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto">
            {notifications.isLoading ? (
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
