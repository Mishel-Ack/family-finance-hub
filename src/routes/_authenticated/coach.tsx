import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Trash2,
  Plus,
  MessageSquare,
  Bot,
  User as UserIcon,
  AlertCircle,
  Database,
  ArrowLeft,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listCoachConversations,
  getCoachConversation,
  askCoach,
  deleteCoachConversation,
  type ToolSource,
} from "@/services/coach";
import { getAiAvailability } from "@/services/ai";
import { LoadingState } from "@/components/common/States";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/coach")({
  head: () => ({ meta: [{ title: "AI Coach · FamilyBudget" }] }),
  component: CoachPage,
});

const STARTER_QUESTIONS = [
  "How much did our household spend this month?",
  "Are we within our budget across all categories?",
  "What recurring subscriptions or bills are coming up?",
  "How are our sinking funds and savings goals progressing?",
];

function CoachPage() {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [mobileShowList, setMobileShowList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const availabilityQuery = useQuery({
    queryKey: ["ai-availability"],
    queryFn: () => getAiAvailability(),
  });

  const conversationsQuery = useQuery({
    queryKey: ["coach-conversations"],
    queryFn: () => listCoachConversations(),
  });

  const conversationQuery = useQuery({
    queryKey: ["coach-conversation", selectedConversationId],
    queryFn: () => (selectedConversationId ? getCoachConversation(selectedConversationId) : null),
    enabled: Boolean(selectedConversationId),
  });

  // Mutations
  const askMutation = useMutation({
    mutationFn: (message: string) =>
      askCoach({
        conversationId: selectedConversationId ?? undefined,
        message,
      }),
    onSuccess: (data) => {
      setInputMessage("");
      if (!selectedConversationId && data.conversationId) {
        setSelectedConversationId(data.conversationId);
      }
      void queryClient.invalidateQueries({ queryKey: ["coach-conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["coach-conversation", data.conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["ai-availability"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to get a response from the coach.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCoachConversation(id),
    onSuccess: (_, id) => {
      toast.success("Conversation deleted.");
      if (selectedConversationId === id) {
        setSelectedConversationId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["coach-conversations"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete conversation.");
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationQuery.data?.messages, askMutation.isPending]);

  const handleSend = () => {
    const trimmed = inputMessage.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const conversations = conversationsQuery.data ?? [];
  const activeConversation = conversationQuery.data;
  const isAiDisabled = availabilityQuery.data && !availabilityQuery.data.enabled;
  const isAiCapped = availabilityQuery.data && availabilityQuery.data.capped;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Financial Coach"
        description="Ask questions about your family finances. All answers are grounded in verified household data."
      />

      {/* Disclaimers & Availability Banner */}
      <div className="flex flex-col gap-2">
        <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          ℹ️ <strong>Note:</strong> Insights and summaries provided by the AI Coach are for
          informational budgeting purposes only and do not constitute professional financial advice.
        </div>

        {isAiDisabled && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              AI features are currently disabled for this household. An Owner or Admin can enable
              them in Settings.
            </span>
          </div>
        )}

        {isAiCapped && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              This family has reached its monthly AI allowance cap. Usage will reset at the start of
              next month.
            </span>
          </div>
        )}
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 min-h-[550px] rounded-xl border bg-card">
        {/* Conversations Sidebar (Hidden on mobile if viewing chat) */}
        <div
          className={`flex flex-col border-b lg:border-b-0 lg:border-r border-border p-3 ${
            mobileShowList ? "block" : "hidden lg:flex"
          } lg:col-span-1`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight">Conversations</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedConversationId(null);
                setMobileShowList(false);
              }}
              className="gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New Chat
            </Button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto max-h-[450px]">
            {conversationsQuery.isLoading ? (
              <LoadingState label="Loading chats…" />
            ) : conversations.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">No conversations yet.</p>
            ) : (
              conversations.map((c) => {
                const isSelected = c.id === selectedConversationId;
                return (
                  <div
                    key={c.id}
                    className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <button
                      className="flex-1 text-left truncate flex items-center gap-2"
                      onClick={() => {
                        setSelectedConversationId(c.id);
                        setMobileShowList(false);
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{c.title}</span>
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isSelected
                              ? "text-primary-foreground hover:bg-primary-foreground/20"
                              : ""
                          }`}
                          aria-label="Delete conversation"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this conversation and its history. This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(c.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div
          className={`flex flex-col lg:col-span-3 ${mobileShowList ? "hidden lg:flex" : "flex"}`}
        >
          {/* Mobile Header Toggle */}
          <div className="flex items-center justify-between border-b p-3 lg:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileShowList(true)}
              className="gap-1 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All Chats
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              {activeConversation?.title ?? "New Conversation"}
            </span>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[420px]">
            {!selectedConversationId && !activeConversation ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="rounded-full bg-primary/10 p-3 mb-3 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-base">Ask your family finances</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-6">
                  Get instant insights into household spending, budget utilization, recurring bills,
                  and savings.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {STARTER_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      onClick={() => {
                        setInputMessage(question);
                      }}
                      className="rounded-lg border bg-card p-3 text-left text-xs hover:border-primary hover:bg-accent/50 transition-colors"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeConversation?.messages.map((msg) => {
                const isUser = msg.role === "USER";
                const sources = Array.isArray(msg.sources)
                  ? (msg.sources as unknown as ToolSource[])
                  : [];

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-none"
                          : "bg-muted rounded-bl-none space-y-2 text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                      {/* Source Cards */}
                      {!isUser && sources.length > 0 && (
                        <div className="pt-2 border-t border-border/40 space-y-1">
                          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1">
                            <Database className="h-2.5 w-2.5" />
                            Verified Data Sources
                          </span>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {sources.map((src, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="text-[11px] bg-background/80 font-normal py-0 px-2"
                              >
                                {src.summary}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {isUser && (
                      <div className="h-7 w-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0 mt-0.5">
                        <UserIcon className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {askMutation.isPending && (
              <div className="flex gap-3 justify-start">
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-none px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary animate-ping" />
                  Analyzing family financial data…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="border-t p-3 bg-card rounded-b-xl">
            <div className="flex flex-col gap-1.5">
              <div className="relative flex items-center">
                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value.slice(0, 600))}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your family finances (e.g., spending, budgets, goals)…"
                  className="min-h-[60px] max-h-[120px] resize-none pr-12 text-sm"
                  disabled={askMutation.isPending || isAiDisabled}
                  maxLength={600}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputMessage.trim() || askMutation.isPending || isAiDisabled}
                  className="absolute right-2.5 bottom-2.5 h-8 w-8"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-between items-center px-1 text-[11px] text-muted-foreground">
                <span>Press Enter to send, Shift+Enter for new line</span>
                <span>{inputMessage.length}/600</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
