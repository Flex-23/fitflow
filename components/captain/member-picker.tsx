"use client";

import { useState } from "react";
import { UserRound, X, Phone, Search } from "lucide-react";
import { searchMembers } from "@/app/actions/courses";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Dictionary } from "@/lib/i18n";

export type BasicMember = { id: string; name: string; phone: string };

export function MemberPicker({
  dict,
  selected,
  onSelect,
  onClear,
}: {
  dict: Dictionary;
  selected: BasicMember | null;
  onSelect: (m: BasicMember) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");

  if (selected) {
    return (
      <Card className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-brand/15 text-brand">
            <UserRound className="size-5" />
          </div>
          <div>
            <p className="font-semibold">{selected.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
              <Phone className="size-3" />
              {selected.phone}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" />
          {dict.captain.changeMember}
        </Button>
      </Card>
    );
  }

  return (
    <div className="relative w-full max-w-2xl">
      <Search className="pointer-events-none absolute start-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground" />
      <Autocomplete<BasicMember>
        value={q}
        onValueChange={setQ}
        onSelect={(m) => {
          onSelect(m);
          setQ("");
        }}
        fetcher={searchMembers}
        getLabel={(m) => `${m.name} — ${m.phone}`}
        getKey={(m) => m.id}
        placeholder={dict.captain.searchMember}
        inputClassName="h-12 rounded-xl ps-12 text-base shadow-md"
      />
    </div>
  );
}
