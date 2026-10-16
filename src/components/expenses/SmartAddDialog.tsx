import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/auth-context";
import { listCategories } from "@/services/category";
import { listFamilyMembers } from "@/services/family";
import { createExpense } from "@/services/expense";
import { getAiAvailability } from "@/services/ai";
import { parseExpenseText } from "@/services/smart-entry";
import { parseReceipt } from "@/services/receipt";
import { parseBankMessagesFnCall } from "@/services/bank-import";
import { saveCategoryCorrection, suggestCategory } from "@/services/categorization";
import { fromPaise } from "@/lib/money";
import { speechTranscriptFromEvent, type SpeechTranscriptEvent } from "@/lib/voice-transcript";

interface SmartDraft {
  key: string;
  amountPaise: number;
  description: string;
  date: string;
  categoryId: string | null;
  originalCategoryId: string | null;
  memberId: string | null;
  memberCandidates: { id: string; displayName: string }[];
  memberAmbiguous: boolean;
  visibility: "SHARED" | "PRIVATE";
  confidence: number;
  source: string;
  fingerprint?: string;
  duplicate: boolean;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechTranscriptEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function currencyInput(paise: number) {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

export function SmartAddDialog() {
  const { family, memberId, user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("text");
  const [text, setText] = useState("");
  const [smsText, setSmsText] = useState("");
  const [drafts, setDrafts] = useState<SmartDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [speechLanguage, setSpeechLanguage] = useState("en-IN");
  const [listening, setListening] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const categoriesQuery = useQuery({
    queryKey: ["categories", family?.id],
    queryFn: listCategories,
    enabled: open && Boolean(family?.id),
  });
  const membersQuery = useQuery({
    queryKey: ["members", family?.id],
    queryFn: listFamilyMembers,
    enabled: open && Boolean(family?.id),
  });
  const aiQuery = useQuery({
    queryKey: ["ai-availability", family?.id],
    queryFn: getAiAvailability,
    enabled: open && Boolean(family?.id),
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
    void queryClient.invalidateQueries({ queryKey: ["trend"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  const setDraft = (key: string, patch: Partial<SmartDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  };

  const loadText = useMutation({
    mutationFn: (inputText: string) => parseExpenseText(inputText),
    onSuccess: (result) => {
      setDrafts(
        result.map((item, index) => ({
          key: `text-${Date.now()}-${index}`,
          amountPaise: item.amountPaise,
          description: item.description,
          date: item.date,
          categoryId: item.categoryId,
          originalCategoryId: item.categoryId,
          memberId: item.memberId,
          memberCandidates: item.memberCandidates,
          memberAmbiguous: item.memberAmbiguous,
          visibility: item.visibility,
          confidence: item.categoryConfidence,
          source: item.categorySource,
          duplicate: false,
        })),
      );
      setBusy(false);
      setProgress("");
    },
    onError: (error: Error) => {
      setBusy(false);
      setProgress("");
      toast.error(error.message);
    },
  });

  const cancelParsing = () => {
    requestVersion.current++;
    setBusy(false);
    setProgress("");
    setReceiptPreview("");
  };

  const parseReceiptFile = async (file: File) => {
    const version = ++requestVersion.current;
    setBusy(true);
    setProgress("Preparing receipt image…");
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Receipt image could not be prepared");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const base64 = dataUrl.split(",")[1];
      if (!base64 || base64.length > 7_000_000)
        throw new Error("Receipt image must be 5 MB or smaller after resizing");
      setReceiptPreview(dataUrl);
      setProgress("Reading receipt…");
      const receipt = await parseReceipt({ base64, mediaType: "image/jpeg" });
      if (version !== requestVersion.current) return;
      setDrafts([
        {
          key: `receipt-${Date.now()}`,
          amountPaise: receipt.totalPaise,
          description: receipt.merchant ?? "Receipt expense",
          date: receipt.date,
          categoryId: receipt.categoryId,
          originalCategoryId: receipt.categoryId,
          memberId,
          memberCandidates: [],
          memberAmbiguous: false,
          visibility: "SHARED",
          confidence: receipt.categoryConfidence,
          source: receipt.categorySource,
          duplicate: false,
        },
      ]);
    } catch (error: unknown) {
      if (version === requestVersion.current)
        toast.error(error instanceof Error ? error.message : "Receipt could not be read");
    } finally {
      if (version === requestVersion.current) {
        setBusy(false);
        setProgress("");
      }
    }
  };

  const parseMessages = async () => {
    const messages = smsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    setBusy(true);
    setProgress("Parsing bank messages…");
    try {
      const result = await parseBankMessagesFnCall(messages);
      const debits = result.items.filter(
        (item) => item.classification === "DEBIT" && item.amountPaise !== null && !item.duplicate,
      );
      const suggested = await Promise.all(
        debits.map(async (item, index) => {
          const suggestion = item.merchant ? await suggestCategory(item.merchant) : null;
          return {
            key: `sms-${Date.now()}-${index}`,
            amountPaise: item.amountPaise!,
            description: item.description,
            date: item.date ?? new Date().toISOString().slice(0, 10),
            categoryId: suggestion?.categoryId ?? null,
            originalCategoryId: suggestion?.categoryId ?? null,
            memberId,
            memberCandidates: [],
            memberAmbiguous: false,
            visibility: "SHARED" as const,
            confidence: suggestion?.confidence ?? 0,
            source: suggestion?.source ?? item.source,
            ...(item.fingerprint ? { fingerprint: item.fingerprint } : {}),
            duplicate: item.duplicate,
          };
        }),
      );
      setDrafts(suggested);
      const duplicateCount = result.items.filter(
        (item) => item.classification === "DEBIT" && item.duplicate,
      ).length;
      if (duplicateCount)
        toast.info(
          `${duplicateCount} duplicate transaction${duplicateCount === 1 ? "" : "s"} skipped`,
        );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Bank messages could not be parsed");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const startVoiceEntry = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.error("Voice entry is not supported in this browser. Type your expense instead.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = speechLanguage;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = speechTranscriptFromEvent(event);
      if (transcript) {
        setText(transcript);
        setBusy(true);
        setProgress("Turning your voice into a draft…");
        loadText.mutate(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      toast.error("Voice recognition stopped. You can type the expense instead.");
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  const saveOne = async (draft: SmartDraft) => {
    if (!draft.categoryId) throw new Error("Choose a category before saving");
    if (draft.duplicate) throw new Error("This transaction was already imported");
    if (
      (typeof navigator === "undefined" || navigator.onLine) &&
      draft.originalCategoryId &&
      draft.originalCategoryId !== draft.categoryId
    ) {
      await saveCategoryCorrection({
        text: draft.description,
        categoryId: draft.categoryId,
        scope: draft.visibility,
      });
    }
    if (!family?.id || !user?.id) throw new Error("Your family account is not ready.");
    const result = await createExpense(
      {
        amount: fromPaise(draft.amountPaise),
        categoryId: draft.categoryId,
        memberId: draft.visibility === "PRIVATE" ? memberId : draft.memberId,
        date: draft.date,
        description: draft.description,
        visibility: draft.visibility,
        ...(draft.fingerprint ? { importFingerprint: draft.fingerprint } : {}),
      },
      { familyId: family.id, userId: user.id },
    );
    setDrafts((current) => current.filter((item) => item.key !== draft.key));
    return result.queued;
  };

  const saveMutation = useMutation({
    mutationFn: async (selected: SmartDraft[]) => {
      setSavingKey(selected.length === 1 ? selected[0]!.key : "all");
      let queued = false;
      for (const draft of selected) queued = (await saveOne(draft)) || queued;
      return queued;
    },
    onSuccess: (queued) => {
      toast.success(
        queued ? "Expense saved offline and will sync when you reconnect" : "Expense saved",
      );
      invalidate();
      if (drafts.length <= 1) setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setSavingKey(null),
  });

  const openDialog = () => {
    setDrafts([]);
    setText("");
    setSmsText("");
    setOpen(true);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        <Sparkles className="mr-1 h-4 w-4" /> Smart add
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Smart add</DialogTitle>
            <DialogDescription>
              AI suggestions are drafts. Review every field and save to create expenses. Shortcut:
              Alt+Shift+A.
            </DialogDescription>
          </DialogHeader>
          {!aiQuery.data?.enabled || aiQuery.data.capped ? (
            <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
              AI is {aiQuery.data?.capped ? "at its monthly limit" : "off"}. Simple text entry,
              regex parsing, and merchant suggestions remain available.
            </p>
          ) : null}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="text">Type it</TabsTrigger>
              <TabsTrigger value="receipt">Scan receipt</TabsTrigger>
              <TabsTrigger value="sms">Paste SMS</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="space-y-3">
              <Label htmlFor="smart-text">Describe one or more expenses</Label>
              <Textarea
                id="smart-text"
                value={text}
                maxLength={500}
                rows={3}
                placeholder="450 groceries yesterday"
                onChange={(event) => setText(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="voice-language">Voice language</Label>
                <select
                  id="voice-language"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={speechLanguage}
                  onChange={(event) => setSpeechLanguage(event.target.value)}
                >
                  <option value="en-IN">English (India)</option>
                  <option value="hi-IN">Hindi</option>
                  <option value="gu-IN">Gujarati</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || listening}
                  onClick={startVoiceEntry}
                >
                  <Mic className="mr-1 h-4 w-4" />
                  {listening ? "Listening…" : "Speak expense"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Recognition quality varies by browser and device.
                </span>
              </div>
              <Button
                disabled={busy || loadText.isPending || !text.trim()}
                onClick={() => {
                  setBusy(true);
                  setProgress("Preparing expense drafts…");
                  loadText.mutate(text);
                }}
              >
                Create drafts
              </Button>
            </TabsContent>
            <TabsContent value="receipt" className="space-y-3">
              <Label htmlFor="receipt-file">Receipt image</Label>
              <Input
                id="receipt-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void parseReceiptFile(file);
                }}
              />
              {receiptPreview ? (
                <img
                  src={receiptPreview}
                  alt="Receipt preview"
                  className="max-h-64 rounded border object-contain"
                />
              ) : null}
              <p className="text-sm text-muted-foreground">
                The image is resized in this browser and is not saved. Maximum dimension: 1600px.
              </p>
            </TabsContent>
            <TabsContent value="sms" className="space-y-3">
              <Label htmlFor="bank-messages">Paste bank or UPI messages, one per line</Label>
              <Textarea
                id="bank-messages"
                value={smsText}
                maxLength={3000}
                rows={5}
                placeholder="Rs 450 debited at Swiggy…"
                onChange={(event) => setSmsText(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Account digits, phone numbers, UPI IDs, and references are masked before any model
                call. Credits are skipped; OTPs and promotions are ignored.
              </p>
              <Button disabled={busy || !smsText.trim()} onClick={() => void parseMessages()}>
                <Upload className="mr-1 h-4 w-4" /> Parse messages
              </Button>
            </TabsContent>
          </Tabs>
          {busy ? (
            <div className="flex items-center gap-3" role="status" aria-live="polite">
              <p className="text-sm text-muted-foreground">{progress}</p>
              <Button variant="outline" size="sm" onClick={cancelParsing}>
                Cancel
              </Button>
            </div>
          ) : null}
          {drafts.length ? (
            <div className="space-y-3" aria-label="Expense drafts">
              {drafts.map((draft) => (
                <Card key={draft.key}>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="secondary">
                        {draft.source} · {Math.round(draft.confidence * 100)}% confidence
                      </Badge>
                      {draft.duplicate ? (
                        <Badge variant="destructive">Already imported</Badge>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`amount-${draft.key}`}>Amount (₹)</Label>
                        <Input
                          id={`amount-${draft.key}`}
                          inputMode="decimal"
                          value={currencyInput(draft.amountPaise)}
                          onChange={(event) => {
                            const amount = Number(event.target.value);
                            if (Number.isFinite(amount) && amount > 0)
                              setDraft(draft.key, { amountPaise: Math.round(amount * 100) });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`date-${draft.key}`}>Date</Label>
                        <Input
                          id={`date-${draft.key}`}
                          type="date"
                          value={draft.date}
                          onChange={(event) => setDraft(draft.key, { date: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`category-${draft.key}`}>Category</Label>
                        <Select
                          value={draft.categoryId ?? ""}
                          onValueChange={(value) => setDraft(draft.key, { categoryId: value })}
                        >
                          <SelectTrigger id={`category-${draft.key}`}>
                            <SelectValue placeholder="Choose a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {(categoriesQuery.data ?? []).map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`member-${draft.key}`}>Member</Label>
                        <Select
                          value={
                            draft.visibility === "PRIVATE"
                              ? (memberId ?? "")
                              : (draft.memberId ?? "none")
                          }
                          onValueChange={(value) =>
                            setDraft(draft.key, { memberId: value === "none" ? null : value })
                          }
                        >
                          <SelectTrigger id={`member-${draft.key}`}>
                            <SelectValue placeholder="You" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">You</SelectItem>
                            {(membersQuery.data ?? []).map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.display_name || "Member"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`description-${draft.key}`}>Description</Label>
                      <Input
                        id={`description-${draft.key}`}
                        maxLength={200}
                        value={draft.description}
                        onChange={(event) =>
                          setDraft(draft.key, { description: event.target.value })
                        }
                      />
                    </div>
                    {draft.memberAmbiguous ? (
                      <p role="status" className="text-sm text-muted-foreground">
                        Several family members match. Choose one above.
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <Label htmlFor={`private-${draft.key}`}>Private</Label>
                      <Switch
                        id={`private-${draft.key}`}
                        checked={draft.visibility === "PRIVATE"}
                        onCheckedChange={(checked) =>
                          setDraft(draft.key, {
                            visibility: checked ? "PRIVATE" : "SHARED",
                            ...(checked ? { memberId } : {}),
                          })
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={saveMutation.isPending || !draft.categoryId || draft.duplicate}
                      onClick={() => saveMutation.mutate([draft])}
                    >
                      {savingKey === draft.key ? "Saving…" : "Save this expense"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {drafts.length > 1 ? (
                <Button
                  className="w-full"
                  disabled={
                    saveMutation.isPending ||
                    drafts.some((draft) => !draft.categoryId || draft.duplicate)
                  }
                  onClick={() => saveMutation.mutate(drafts)}
                >
                  Save all {drafts.length} expenses
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
