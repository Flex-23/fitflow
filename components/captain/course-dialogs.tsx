"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Copy,
  FileDown,
  Pencil,
  Trash2,
  History,
  BookmarkCheck,
  CalendarDays,
  Dumbbell,
  Check,
  X,
  Send,
  Loader2,
} from "lucide-react";
import { deleteTemplate, type TrainingCourseDTO } from "@/app/actions/courses";
import { sendCourseToMember } from "@/app/actions/whatsapp";
import { reportSend } from "@/components/captain/whatsapp-send";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const exerciseTotal = (c: TrainingCourseDTO) =>
  c.days.reduce((n, d) => n + d.exercises.length, 0);

/** Re-deliver an already saved course PDF over WhatsApp. */
function ResendButton({
  courseId,
  memberName,
  dict,
}: {
  courseId: string;
  memberName: string;
  dict: Dictionary;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="soft-success"
      size="xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await sendCourseToMember("training", courseId);
          reportSend(res, memberName, dict);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Send />}
      {pending ? dict.captain.sending : dict.captain.sendWhatsApp}
    </Button>
  );
}

/** Compact day-by-day preview of a course body. */
function CoursePreview({ course, dict }: { course: TrainingCourseDTO; dict: Dictionary }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {course.days.map((d, i) => (
        <div key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
          <p className="font-semibold">
            {d.label || `${dict.captain.day} ${i + 1}`}
            <span className="ms-1.5 font-normal text-muted-foreground">
              ({d.exercises.length} {dict.captain.exercisesCount})
            </span>
          </p>
          <p className="mt-0.5 truncate text-muted-foreground">
            {d.exercises.map((e) => e.name).join(" · ") || "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Previous courses ───────────────────────── */

export function PreviousCoursesDialog({
  open,
  onClose,
  courses,
  onCopy,
  dict,
  locale,
  member,
  whatsappEnabled,
}: {
  open: boolean;
  onClose: () => void;
  courses: TrainingCourseDTO[];
  onCopy: (course: TrainingCourseDTO) => void;
  dict: Dictionary;
  locale: Locale;
  member: { name: string; phone: string } | null;
  whatsappEnabled: boolean;
}) {
  const t = dict.captain;
  return (
    <Dialog open={open} onClose={onClose} title={t.previousCourses} className="max-w-3xl">
      {courses.length === 0 ? (
        <EmptyState icon={History} title={t.noPrevious} className="py-10" />
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CalendarDays className="size-4 text-brand" />
                    {formatDate(c.createdAt, locale)}
                  </span>
                  <Badge variant="secondary">
                    {c.days.length} {t.daysCount}
                  </Badge>
                  <Badge variant="muted">
                    {exerciseTotal(c)} {t.exercisesCount}
                  </Badge>
                  {c.expiresAt && (
                    <span className="text-xs text-muted-foreground">
                      {t.autoDeleteOn} {formatDate(c.expiresAt, locale)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {whatsappEnabled && member && (
                    <ResendButton courseId={c.id} memberName={member.name} dict={dict} />
                  )}
                  <Button asChild variant="soft" size="xs">
                    <a href={`/api/courses/training/${c.id}/pdf`} target="_blank" rel="noopener noreferrer">
                      <FileDown />
                      {t.openPdf}
                    </a>
                  </Button>
                  <Button variant="soft-brand" size="xs" onClick={() => onCopy(c)}>
                    <Copy />
                    {t.copyCourse}
                  </Button>
                </div>
              </div>
              <CoursePreview course={c} dict={dict} />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ───────────────────────── Templates ───────────────────────── */

export function TemplatesDialog({
  open,
  onClose,
  templates,
  onUse,
  onEdit,
  dict,
}: {
  open: boolean;
  onClose: () => void;
  templates: TrainingCourseDTO[];
  onUse: (tpl: TrainingCourseDTO) => void;
  onEdit: (tpl: TrainingCourseDTO) => void;
  dict: Dictionary;
}) {
  const t = dict.captain;
  return (
    <Dialog open={open} onClose={onClose} title={t.templatesTitle} className="max-w-xl">
      {templates.length === 0 ? (
        <EmptyState
          icon={BookmarkCheck}
          title={t.noTemplates}
          description={t.noTemplatesDesc}
          className="py-10"
        />
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <TemplateRow
              key={tpl.id}
              tpl={tpl}
              onUse={() => onUse(tpl)}
              onEdit={() => onEdit(tpl)}
              dict={dict}
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}

function TemplateRow({
  tpl,
  onUse,
  onEdit,
  dict,
}: {
  tpl: TrainingCourseDTO;
  onUse: () => void;
  onEdit: () => void;
  dict: Dictionary;
}) {
  const t = dict.captain;
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      const res = await deleteTemplate(tpl.id);
      if (res.ok) toast.success(t.templateDeleted);
      else toast.error(dict.common.somethingWrong);
      setConfirming(false);
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
        confirming ? "border-destructive/40" : "border-border"
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Dumbbell className="size-4 text-brand" />
        {tpl.title || t.untitledTemplate}
      </span>

      {confirming ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-destructive">{t.confirmDeleteTemplate}</span>
            <Button variant="destructive" size="xs" onClick={remove} disabled={pending}>
              <Check />
              {dict.common.yes}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setConfirming(false)} disabled={pending}>
              <X />
              {dict.common.no}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button variant="soft-destructive" size="xs" onClick={() => setConfirming(true)}>
              <Trash2 />
              {dict.common.delete}
            </Button>
            <Button variant="soft" size="xs" onClick={onEdit}>
              <Pencil />
              {t.editTemplate}
            </Button>
            <Button variant="soft-brand" size="xs" onClick={onUse}>
              <Copy />
              {t.useTemplate}
            </Button>
          </div>
        )}
    </div>
  );
}
