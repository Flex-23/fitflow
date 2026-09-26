"use client";

import { memo, useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Save,
  Send,
  Bookmark,
  FileDown,
  Video,
  Dumbbell,
  History,
  BookmarkCheck,
  Eraser,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import {
  getMemberTraining,
  createTrainingCourse,
  updateTemplate,
  type TrainingCourseDTO,
  type MemberTrainingProfile,
} from "@/app/actions/courses";
import { MemberPicker } from "@/components/captain/member-picker";
import { MemberSummary } from "@/components/captain/member-summary";
import { PreviousCoursesDialog, TemplatesDialog } from "@/components/captain/course-dialogs";
import { CourseDelivery, reportCourseLink } from "@/components/captain/course-delivery";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Fixed layout: 4 day tabs × 12 numbered rows. Each row holds the main
 * exercise and, beside it, an optional superset partner. A filled partner
 * makes the pair a superset; an empty one means a standalone exercise.
 */
const DAY_COUNT = 4;
const ROWS_PER_DAY = 12;
/**
 * Six characters of reps, matching the schema.
 *
 * Enforced on the way in as well as by maxLength, because a paste is not
 * typing and the browser will happily drop a long one straight in.
 */
const REPS_MAX = 6;

export type VideoOption = { id: string; exerciseName: string; hiddenToken: string };

type Slot = { name: string; reps: string; videoId: string | null; videoToken: string | null };
type Row = { key: string; main: Slot; pair: Slot };
type Day = { key: string; label: string; rows: Row[] };
type Side = "main" | "pair";

const uid = () => crypto.randomUUID();
const emptySlot = (): Slot => ({ name: "", reps: "", videoId: null, videoToken: null });
const emptyRow = (): Row => ({ key: uid(), main: emptySlot(), pair: emptySlot() });
const emptyDay = (): Day => ({
  key: uid(),
  label: "",
  rows: Array.from({ length: ROWS_PER_DAY }, emptyRow),
});
const emptyDays = () => Array.from({ length: DAY_COUNT }, emptyDay);

/** Load a saved course into the fixed grid: superset partners go beside their main. */
function fromDTO(days: TrainingCourseDTO["days"]): Day[] {
  return Array.from({ length: DAY_COUNT }, (_, di) => {
    const d = days[di];
    if (!d) return emptyDay();
    const rows: Row[] = [];
    let lastGroup: number | null = null;
    for (const e of d.exercises) {
      const slot: Slot = {
        name: e.name,
        reps: e.reps === "-" ? "" : e.reps,
        videoId: e.videoId,
        videoToken: e.videoToken,
      };
      const last = rows[rows.length - 1];
      // Second member of a superset pair sits beside the first one.
      if (last && !last.pair.name && e.supersetGroup != null && e.supersetGroup === lastGroup) {
        last.pair = slot;
      } else {
        rows.push({ key: uid(), main: slot, pair: emptySlot() });
        lastGroup = e.supersetGroup;
      }
    }
    const trimmed = rows.slice(0, ROWS_PER_DAY);
    return {
      key: uid(),
      label: d.label,
      rows: [...trimmed, ...Array.from({ length: ROWS_PER_DAY - trimmed.length }, emptyRow)],
    };
  });
}

function filterVideos(videos: VideoOption[], q: string): VideoOption[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const out: VideoOption[] = [];
  for (const v of videos) {
    if (v.exerciseName.toLowerCase().includes(needle)) {
      out.push(v);
      if (out.length === 8) break;
    }
  }
  return out;
}

export function TrainingBuilder({
  dict,
  locale,
  templates,
  videos,
  whatsappEnabled,
}: {
  dict: Dictionary;
  locale: Locale;
  templates: TrainingCourseDTO[];
  videos: VideoOption[];
  whatsappEnabled: boolean;
}) {
  const t = dict.captain;
  const dayNames = t.dayNames.slice(0, DAY_COUNT);

  const [member, setMember] = useState<MemberTrainingProfile | null>(null);
  const [previous, setPrevious] = useState<TrainingCourseDTO[]>([]);
  const [loadingMember, startLoading] = useTransition();
  const [days, setDays] = useState<Day[]>(emptyDays);
  const [activeDay, setActiveDay] = useState(0);
  const [dialog, setDialog] = useState<"previous" | "templates" | "template-name" | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<{ id: string; shareToken: string | null } | null>(null);

  // In-memory suggestions: instant, no network.
  const videoFetcher = useCallback(
    (q: string) => Promise.resolve(filterVideos(videos, q)),
    [videos]
  );

  /* ── member ── */
  // Each pick gets a number; only the latest one may land. Without this, a
  // member picked while an earlier pick was still loading could be replaced
  // by the earlier one when its slower answer arrived — and the course would
  // then be saved and sent to the wrong person.
  const pickSeq = useRef(0);
  function selectMember(id: string) {
    const seq = ++pickSeq.current;
    setSaved(null);
    startLoading(async () => {
      const ctx = await getMemberTraining(id);
      if (seq !== pickSeq.current) return;
      if (!ctx) {
        toast.error(dict.common.somethingWrong);
        return;
      }
      setMember(ctx.member);
      setPrevious(ctx.courses);
    });
  }
  function clearMember() {
    pickSeq.current++;
    setMember(null);
    setPrevious([]);
    setSaved(null);
  }

  /* ── editing (stable callbacks so memoised rows skip re-renders) ── */
  const patchSlot = useCallback((di: number, ri: number, side: Side, patch: Partial<Slot>) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i !== di
          ? d
          : {
              ...d,
              rows: d.rows.map((r, j) => (j !== ri ? r : { ...r, [side]: { ...r[side], ...patch } })),
            }
      )
    );
  }, []);
  const updateDay = (di: number, patch: Partial<Day>) =>
    setDays((prev) => prev.map((d, i) => (i === di ? { ...d, ...patch } : d)));
  const clearDay = (di: number) => updateDay(di, { label: "", rows: emptyDay().rows });

  function loadBody(source: TrainingCourseDTO["days"]) {
    setDays(fromDTO(source));
    setActiveDay(0);
    setSaved(null);
  }

  /* ── payload ── */
  function buildPayload() {
    return days
      .map((d, idx) => {
        const exercises: {
          name: string;
          reps: string;
          videoId: string | null;
          videoToken: string | null;
          supersetGroup: number | null;
        }[] = [];
        d.rows.forEach((r, ri) => {
          const main = r.main.name.trim();
          const pair = r.pair.name.trim();
          const group = main && pair ? ri + 1 : null;
          for (const [name, s] of [
            [main, r.main],
            [pair, r.pair],
          ] as const) {
            if (!name) continue;
            exercises.push({
              name,
              reps: s.reps.trim() || "-",
              videoId: s.videoId,
              videoToken: s.videoToken,
              supersetGroup: group,
            });
          }
        });
        return { label: d.label.trim() || dayNames[idx], exercises };
      })
      .filter((d) => d.exercises.length > 0);
  }

  /**
   * Save the course and send the member their link.
   *
   * One action, no question: a course that has been written is a course the
   * member should be able to read, so the link goes out with it. The server
   * does the sending, so nothing opens here.
   */
  function saveAndSend() {
    if (!member) return toast.error(t.noMemberSelected);
    const payloadDays = buildPayload();
    if (payloadDays.length === 0) return toast.error(t.addExerciseFirst);
    const seq = pickSeq.current;
    startSaving(async () => {
      const res = await createTrainingCourse({
        memberId: member.id,
        isTemplate: false,
        days: payloadDays,
      });
      if (!res.ok || !res.id) {
        toast.error(dict.common.somethingWrong);
        return;
      }
      toast.success(t.saved);

      // The captain may have moved on to another member while this saved;
      // this member's history must not be shown under theirs.
      if (seq !== pickSeq.current) return;
      const ctx = await getMemberTraining(member.id);
      if (seq !== pickSeq.current) return;
      if (ctx) setPrevious(ctx.courses);

      // On the way out there is nothing left to do with this course, so the
      // board is cleared for the next one. The panel only stays when the
      // link did not go out, which is where the manual send lives.
      if (reportCourseLink(res.link, dict)) resetBuilder();
      else setSaved({ id: res.id, shareToken: res.shareToken ?? null });
    });
  }

  /** Empty the grid and put the delivery panel away. */
  function resetBuilder() {
    setDays(emptyDays());
    setActiveDay(0);
    setSaved(null);
  }

  function saveAsTemplate(title: string) {
    const payloadDays = buildPayload();
    if (payloadDays.length === 0) return toast.error(t.addExerciseFirst);
    startSaving(async () => {
      const res = await createTrainingCourse({
        isTemplate: true,
        title: title.trim() || null,
        days: payloadDays,
      });
      if (res.ok) {
        setDialog(null);
        toast.success(t.templateSaved);
      } else {
        toast.error(dict.common.somethingWrong);
      }
    });
  }

  function saveTemplateChanges() {
    if (!editing) return;
    const payloadDays = buildPayload();
    if (payloadDays.length === 0) return toast.error(t.addExerciseFirst);
    startSaving(async () => {
      const res = await updateTemplate(editing.id, {
        isTemplate: true,
        title: editing.title.trim() || null,
        days: payloadDays,
      });
      if (res.ok) {
        toast.success(t.templateUpdated);
        setEditing(null);
        setDays(emptyDays());
      } else {
        toast.error(dict.common.somethingWrong);
      }
    });
  }

  const day = days[activeDay];
  const filledCounts = useMemo(
    () => days.map((d) => d.rows.filter((r) => r.main.name.trim() || r.pair.name.trim()).length),
    [days]
  );

  return (
    <div className="space-y-5">
      {/* ── Member ── */}
      {member ? (
        <MemberSummary member={member} dict={dict} locale={locale} onClear={clearMember} />
      ) : (
        <div className="flex items-center gap-3">
          <MemberPicker dict={dict} selected={null} onSelect={(m) => selectMember(m.id)} onClear={clearMember} />
          {loadingMember && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>
      )}

      {/* ── Template edit banner ── */}
      {editing && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3">
          <Pencil className="size-4 shrink-0 text-brand" />
          <span className="text-sm font-semibold">{t.editingTemplate}:</span>
          <Input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder={t.templateName}
            className="h-9 max-w-xs"
          />
          <div className="ms-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setDays(emptyDays()); }}>
              <X className="size-4" />
              {t.cancelEdit}
            </Button>
            <Button variant="brand" size="sm" onClick={saveTemplateChanges} disabled={saving}>
              <Save className="size-4" />
              {saving ? dict.common.saving : t.saveChanges}
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1.5">
        {dayNames.map((name, i) => {
          const active = i === activeDay;
          const filled = filledCounts[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveDay(i)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
                active
                  ? "bg-brand/15 text-brand shadow-[inset_0_-2px_0_0_var(--brand)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {name}
              {filled > 0 && (
                <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-brand/20" : "bg-muted")}>
                  {filled}
                </span>
              )}
            </button>
          );
        })}
        <div className="ms-auto flex items-center gap-1">
          <TabButton
            icon={History}
            label={t.previousCourses}
            count={previous.length}
            onClick={() => (member ? setDialog("previous") : toast.error(t.noMemberSelected))}
          />
          <TabButton
            icon={BookmarkCheck}
            label={t.templates}
            count={templates.length}
            onClick={() => setDialog("templates")}
          />
        </div>
      </div>

      {/* ── Active day ── */}
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-brand">{dayNames[activeDay]}</h2>
          <Input
            key={day.key}
            value={day.label}
            onChange={(e) => updateDay(activeDay, { label: e.target.value })}
            placeholder={t.dayLabel}
            className="h-9 max-w-xs"
          />
          <Button variant="ghost" size="sm" className="ms-auto text-muted-foreground" onClick={() => clearDay(activeDay)}>
            <Eraser className="size-4" />
            {t.clearDay}
          </Button>
        </div>

        {/* Column headings */}
        <div className="mb-2 hidden gap-x-6 lg:grid lg:grid-cols-2">
          <ColumnHeading text={t.mainExercise} />
          <ColumnHeading text={t.supersetPair} muted />
        </div>

        <div className="space-y-2">
          {day.rows.map((row, ri) => (
            <div key={row.key} className="grid gap-2 lg:grid-cols-2 lg:gap-x-6">
              <SlotField
                di={activeDay}
                ri={ri}
                side="main"
                slot={row.main}
                dict={dict}
                fetcher={videoFetcher}
                onPatch={patchSlot}
              />
              <SlotField
                di={activeDay}
                ri={ri}
                side="pair"
                slot={row.pair}
                dict={dict}
                fetcher={videoFetcher}
                onPatch={patchSlot}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Actions ── */}
      {!editing && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button variant="brand" size="lg" onClick={saveAndSend} disabled={saving || !member}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {saving ? t.saving : t.saveSend}
          </Button>
          <Button variant="outline" onClick={() => setDialog("template-name")} disabled={saving}>
            <Bookmark className="size-4" />
            {t.saveAsTemplate}
          </Button>
          {saved && (
            <Button asChild variant="secondary">
              <a href={`/api/courses/training/${saved.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileDown className="size-4" />
                {t.openPdf}
              </a>
            </Button>
          )}
        </div>
      )}

      {/* ── Delivery ── */}
      {saved && member && (
        <CourseDelivery
          courseId={saved.id}
          kind="training"
          member={{ id: member.id, name: member.name, phone: member.phone }}
          shareToken={saved.shareToken}
          whatsappEnabled={whatsappEnabled}
          dict={dict}
        />
      )}

      {!member && !editing && (
        <EmptyState icon={Dumbbell} title={t.noMemberSelected} description={t.noMemberDesc} />
      )}

      {/* ── Dialogs ── */}
      <PreviousCoursesDialog
        open={dialog === "previous"}
        onClose={() => setDialog(null)}
        courses={previous}
        dict={dict}
        locale={locale}
        member={member ? { id: member.id, name: member.name, phone: member.phone } : null}
        whatsappEnabled={whatsappEnabled}
        onCopy={(c) => {
          loadBody(c.days);
          setDialog(null);
          toast.success(t.courseCopied);
        }}
      />
      <TemplatesDialog
        open={dialog === "templates"}
        onClose={() => setDialog(null)}
        templates={templates}
        dict={dict}
        onUse={(tpl) => {
          loadBody(tpl.days);
          setEditing(null);
          setDialog(null);
          toast.success(tpl.title || t.untitledTemplate);
        }}
        onEdit={(tpl) => {
          loadBody(tpl.days);
          setEditing({ id: tpl.id, title: tpl.title ?? "" });
          setDialog(null);
        }}
      />
      <Dialog open={dialog === "template-name"} onClose={() => setDialog(null)} title={t.saveAsTemplate}>
        <TemplateNameForm dict={dict} onSave={saveAsTemplate} saving={saving} />
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Pieces ───────────────────────── */

function TabButton({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-4" />
      {label}
      {count > 0 && <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{count}</span>}
    </button>
  );
}

function ColumnHeading({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <p className={cn("ps-8 text-xs font-semibold uppercase tracking-wide", muted ? "text-muted-foreground" : "text-foreground")}>
      {text}
    </p>
  );
}

/**
 * One numbered input pair (exercise + reps). Memoised: only the slot being
 * typed in re-renders, which keeps typing snappy across 24 fields.
 */
const SlotField = memo(function SlotField({
  di,
  ri,
  side,
  slot,
  dict,
  fetcher,
  onPatch,
}: {
  di: number;
  ri: number;
  side: Side;
  slot: Slot;
  dict: Dictionary;
  fetcher: (q: string) => Promise<VideoOption[]>;
  onPatch: (di: number, ri: number, side: Side, patch: Partial<Slot>) => void;
}) {
  const t = dict.captain;
  const linked = !!slot.videoToken;
  const isPair = side === "pair";

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "w-6 shrink-0 text-end text-xs font-bold tabular-nums",
          isPair ? "text-muted-foreground" : "text-brand"
        )}
      >
        {ri + 1}
      </span>

      <div className="relative flex-1">
        <Autocomplete<VideoOption>
          value={slot.name}
          onValueChange={(v) => onPatch(di, ri, side, { name: v, videoId: null, videoToken: null })}
          onSelect={(v) => onPatch(di, ri, side, { name: v.exerciseName, videoId: v.id, videoToken: v.hiddenToken })}
          fetcher={fetcher}
          getLabel={(v) => v.exerciseName}
          getKey={(v) => v.id}
          debounceMs={0}
          placeholder={isPair ? t.supersetPlaceholder : t.exercisePlaceholder}
          inputClassName={cn(
            "h-9",
            isPair && "border-dashed",
            linked && "pe-8 border-brand/40"
          )}
        />
        {linked && (
          <Video
            className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-brand"
            aria-label={t.linkedVideo}
          />
        )}
      </div>

      <Input
        value={slot.reps}
        onChange={(e) => onPatch(di, ri, side, { reps: e.target.value.slice(0, REPS_MAX) })}
        placeholder={t.reps}
        maxLength={REPS_MAX}
        dir="ltr"
        className={cn("h-9 w-20 shrink-0 text-center", isPair && "border-dashed")}
      />
    </div>
  );
});

function TemplateNameForm({
  dict,
  onSave,
  saving,
}: {
  dict: Dictionary;
  onSave: (title: string) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(title);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="tplName">{dict.captain.templateName}</Label>
        <Input id="tplName" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={saving}>
          {saving ? dict.common.saving : dict.common.save}
        </Button>
      </div>
    </form>
  );
}
