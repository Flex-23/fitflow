"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Save, Send, FileDown, Salad, Loader2 } from "lucide-react";
import { createNutritionCourse } from "@/app/actions/nutrition";
import { searchMeals } from "@/app/actions/nutrition";
import { MemberPicker, type BasicMember } from "@/components/captain/member-picker";
import { MemberSummary } from "@/components/captain/member-summary";
import { getMemberProfile, type MemberTrainingProfile } from "@/app/actions/courses";
import type { Locale } from "@/lib/i18n/config";
import { WhatsAppSend, reportSend } from "@/components/captain/whatsapp-send";
import { sendCourseToMember } from "@/app/actions/whatsapp";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Dictionary } from "@/lib/i18n";

const MEALS_PER_DAY = 7;
const INITIAL_DAYS = 5;
const uid = () => crypto.randomUUID();

type Meal = { key: string; text: string };
type Day = { key: string; label: string; meals: Meal[] };

const newDay = (): Day => ({
  key: uid(),
  label: "",
  meals: Array.from({ length: MEALS_PER_DAY }, () => ({ key: uid(), text: "" })),
});

export function NutritionBuilder({
  dict,
  locale,
  whatsappEnabled,
}: {
  dict: Dictionary;
  locale: Locale;
  whatsappEnabled: boolean;
}) {
  const t = dict.captain;
  const [member, setMember] = useState<MemberTrainingProfile | null>(null);
  const [loadingMember, startLoading] = useTransition();
  const [days, setDays] = useState<Day[]>(() =>
    Array.from({ length: INITIAL_DAYS }, newDay)
  );
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<{ id: string; shareToken: string | null } | null>(null);

  function selectMember(m: BasicMember) {
    setSaved(null);
    startLoading(async () => {
      const profile = await getMemberProfile(m.id);
      if (!profile) {
        toast.error(dict.common.somethingWrong);
        return;
      }
      setMember(profile);
    });
  }

  const updateMeal = (di: number, mi: number, text: string) =>
    setDays((prev) =>
      prev.map((d, i) =>
        i === di
          ? { ...d, meals: d.meals.map((m, j) => (j === mi ? { ...m, text } : m)) }
          : d
      )
    );
  const updateLabel = (di: number, label: string) =>
    setDays((prev) => prev.map((d, i) => (i === di ? { ...d, label } : d)));

  function save() {
    if (!member) return toast.error(t.noMemberSelected);
    const payloadDays = days.map((d, i) => ({
      label: d.label.trim() || `${t.day} ${i + 1}`,
      meals: d.meals.map((m) => m.text.trim()),
    }));
    startSaving(async () => {
      const res = await createNutritionCourse({ memberId: member.id, days: payloadDays });
      if (!res.ok || !res.id) {
        toast.error(dict.common.somethingWrong);
        return;
      }
      setSaved({ id: res.id, shareToken: res.shareToken ?? null });
      toast.success(t.saved);

      if (!whatsappEnabled) {
        toast.info(t.whatsappStub);
        return;
      }
      const sendId = toast.loading(t.sending);
      const sent = await sendCourseToMember("nutrition", res.id);
      toast.dismiss(sendId);
      reportSend(sent, member.name, dict);
    });
  }

  return (
    <div className="space-y-6">
      {member ? (
        <MemberSummary
          member={member}
          dict={dict}
          locale={locale}
          onClear={() => {
            setMember(null);
            setSaved(null);
          }}
        />
      ) : (
        <div className="flex items-center gap-3">
          <MemberPicker dict={dict} selected={null} onSelect={selectMember} onClear={() => {}} />
          {loadingMember && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>
      )}

      <div className="space-y-4">
        {days.map((day, di) => (
          <Card key={day.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-sm font-bold text-brand">
                  {di + 1}
                </span>
                <Input
                  value={day.label}
                  onChange={(e) => updateLabel(di, e.target.value)}
                  placeholder={`${t.day} ${di + 1}`}
                  className="max-w-xs font-medium"
                />
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {day.meals.map((meal, mi) => (
                <div key={meal.key} className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs text-muted-foreground">
                    {mi + 1}
                  </span>
                  <Autocomplete<{ text: string }>
                    className="flex-1"
                    value={meal.text}
                    onValueChange={(v) => updateMeal(di, mi, v)}
                    onSelect={(v) => updateMeal(di, mi, v.text)}
                    fetcher={(q) => searchMeals(q)}
                    getLabel={(v) => v.text}
                    getKey={(v) => v.text}
                    placeholder={`${t.meal} ${mi + 1}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button variant="outline" onClick={() => setDays((p) => [...p, newDay()])}>
          <Plus className="size-4" />
          {t.addDay}
        </Button>
        <Button variant="brand" size="lg" onClick={save} disabled={saving || !member}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : whatsappEnabled ? (
            <Send className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
          {saving
            ? whatsappEnabled
              ? t.saving
              : t.savingOnly
            : whatsappEnabled
              ? t.saveNutrition
              : t.saveOnly}
        </Button>
        {saved && (
          <Button asChild variant="secondary">
            <a href={`/api/courses/nutrition/${saved.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <FileDown className="size-4" />
              {t.openPdf}
            </a>
          </Button>
        )}
      </div>

      {saved && member && whatsappEnabled && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <span className="text-sm font-medium">
            {t.whatsappReady} <span className="font-semibold">{member.name}</span>{" "}
            <span className="text-muted-foreground" dir="ltr">
              ({member.phone})
            </span>
          </span>
          <div className="ms-auto">
            <WhatsAppSend
              courseId={saved.id}
              phone={member.phone}
              memberName={member.name}
              kind="nutrition"
              shareToken={saved.shareToken}
              pdfUrl={`/api/courses/nutrition/${saved.id}/pdf`}
              dict={dict}
              enabled={whatsappEnabled}
            />
          </div>
        </div>
      )}

      {!member && (
        <EmptyState
          icon={Salad}
          title={t.noMemberSelected}
          description={t.noMemberDesc}
        />
      )}
    </div>
  );
}
