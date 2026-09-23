"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Video, Upload, Play, Pencil, Trash2, ShieldCheck, Info, Link as LinkIcon } from "lucide-react";
import { MAX_VIDEO_BYTES, isAcceptedVideoType } from "@/lib/video-formats";
import {
  editVideo,
  deleteVideo,
  requestVideoUpload,
  registerVideo,
  addVideoLink,
} from "@/app/actions/videos";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { parseVideoLink, providerLabel } from "@/lib/video-link";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

export type VideoRow = {
  id: string;
  exerciseName: string;
  hiddenToken: string;
  addedByName: string | null;
  createdAt: string;
  /** Where the video lives. A link is never stored by us. */
  source: "UPLOAD" | "LINK";
  url: string | null;
};

export function VideosLibrary({ videos, dict }: { videos: VideoRow[]; dict: Dictionary }) {
  const t = dict.videos;
  const [preview, setPreview] = useState<VideoRow | null>(null);
  const [editing, setEditing] = useState<VideoRow | null>(null);
  const [deleting, setDeleting] = useState<VideoRow | null>(null);

  return (
    <div className="space-y-6">
      <AddVideoCard dict={dict} />

      <div className="space-y-4">
        <SearchInput placeholder={t.searchVideos} />
        {videos.length === 0 ? (
          <EmptyState icon={Video} title={t.noVideos} description={t.noVideosDesc} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v) => (
              <Card key={v.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setPreview(v)}
                  className="group relative flex aspect-video items-center justify-center rounded-t-xl bg-gradient-to-br from-secondary to-muted"
                >
                  <Play className="size-10 text-brand transition-transform group-hover:scale-110" />
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 font-medium">{v.exerciseName}</p>
                    {v.source === "LINK" && v.url && (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <LinkIcon className="size-3" />
                        {providerLabel(parseVideoLink(v.url)?.provider ?? "other")}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {v.addedByName ? `${t.addedBy} ${v.addedByName}` : ""}
                  </p>
                  <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                    <Button variant="ghost" size="sm" onClick={() => setPreview(v)}>
                      <Play className="size-4" />
                      {t.preview}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(v)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(v)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.exerciseName}
        className="max-w-2xl"
      >
        {preview && <PreviewBody video={preview} dict={dict} />}
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={dict.common.edit}>
        {editing && (
          <EditForm key={editing.id} video={editing} dict={dict} onDone={() => setEditing(null)} />
        )}
      </Dialog>

      {/* Delete */}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t.deleteConfirmTitle}
        description={t.deleteConfirmDesc}
      >
        {deleting && (
          <DeleteConfirm
            video={deleting}
            dict={dict}
            onDone={() => setDeleting(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

/**
 * Preview for either kind of video: our own file plays inline, somebody
 * else's plays in their iframe, and one we cannot frame is handed over as a
 * link rather than shown as a black box.
 */
function PreviewBody({ video, dict }: { video: VideoRow; dict: Dictionary }) {
  const t = dict.videos;
  const link = video.source === "LINK" ? parseVideoLink(video.url ?? "") : null;

  if (link?.embedUrl) {
    return (
      <iframe
        key={video.id}
        src={link.embedUrl}
        title={video.exerciseName}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video w-full overflow-hidden rounded-lg bg-black"
      />
    );
  }

  if (link) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-black p-10 text-center">
        <LinkIcon className="size-8 text-brand" />
        <p className="text-sm text-white/80" dir="ltr">
          {link.url}
        </p>
        <Button asChild variant="brand" size="sm">
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {t.openLink}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="select-none overflow-hidden rounded-lg bg-black"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <video
        key={video.id}
        controls
        autoPlay
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noremoteplayback"
        onContextMenu={(e) => e.preventDefault()}
        className="w-full"
        src={`/api/videos/stream/${video.hiddenToken}`}
      />
    </div>
  );
}

function UploadCard({ dict }: { dict: Dictionary }) {
  const t = dict.videos;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  /**
   * The file goes straight to Supabase Storage: the app server only signs the
   * upload and records the result afterwards, because a request through it
   * would be refused above 4.5 MB.
   */
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error(t.fileRequired);
    if (!name.trim()) return toast.error(t.exerciseName);
    if (!isAcceptedVideoType(file.type)) return toast.error(t.invalidFile);
    // Checked again on the server; this just saves a pointless upload.
    if (file.size > MAX_VIDEO_BYTES) return toast.error(t.fileTooLarge);

    const chosen = file;
    setProgress(0);
    const ticket = await requestVideoUpload(chosen.type, chosen.size);
    if (!ticket.ok) {
      setProgress(null);
      const messages: Record<string, string> = {
        too_large: t.fileTooLarge,
        invalid_file: t.invalidFile,
        storage_off: t.storageOff,
      };
      return toast.error(messages[ticket.error] ?? dict.common.somethingWrong);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", ticket.url);
        xhr.setRequestHeader("Content-Type", chosen.type);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("network error"));
        xhr.send(chosen);
      });

      const res = await registerVideo({
        exerciseName: name.trim(),
        storedFilename: ticket.storedFilename,
        mimeType: chosen.type,
        sizeBytes: chosen.size,
        originalName: chosen.name,
      });
      setProgress(null);
      if (!res.ok) return toast.error(dict.common.somethingWrong);

      toast.success(t.uploaded);
      setName("");
      setFile(null);
      formRef.current?.reset();
      router.refresh();
    } catch {
      setProgress(null);
      toast.error(dict.common.somethingWrong);
    }
  }

  return (
    <>
        <form ref={formRef} onSubmit={upload} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="exerciseName">{t.exerciseName}</Label>
            <Input
              id="exerciseName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file">{t.chooseFile}</Label>
            <Input
              id="file"
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="file:me-3 file:rounded file:bg-secondary file:px-2 file:py-1"
            />
          </div>
          <Button type="submit" variant="brand" disabled={progress !== null}>
            <Upload className="size-4" />
            {progress !== null ? `${progress}%` : t.upload}
          </Button>
        </form>
        {progress !== null && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            {t.hiddenLinkNote}
          </span>
          <span className="flex items-center gap-1.5">
            <Info className="size-3.5" />
            {t.maxSizeNote.replace("{mb}", String(MAX_VIDEO_BYTES / 1024 / 1024))}
          </span>
        </p>
    </>
  );
}

/**
 * Record a video hosted elsewhere. Nothing is uploaded or copied: the gym is
 * pointing at a page on YouTube or TikTok, so there is no size limit and
 * nothing of ours to store.
 */
function LinkForm({ dict }: { dict: Dictionary }) {
  const t = dict.videos;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, startSaving] = useTransition();

  // Parsed as it is typed, so the provider is confirmed before submitting
  // rather than after a round trip.
  const parsed = url.trim() ? parseVideoLink(url) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error(t.exerciseName);
    if (!parsed) return toast.error(t.invalidLink);

    startSaving(async () => {
      const res = await addVideoLink({ exerciseName: name.trim(), url });
      if (!res.ok) {
        toast.error(res.error === "invalid_link" ? t.invalidLink : dict.common.somethingWrong);
        return;
      }
      toast.success(t.linkAdded);
      setName("");
      setUrl("");
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <>
      <form ref={formRef} onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="linkExerciseName">{t.exerciseName}</Label>
          <Input
            id="linkExerciseName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="videoUrl">{t.videoUrl}</Label>
          <Input
            id="videoUrl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            dir="ltr"
            inputMode="url"
            placeholder="https://youtube.com/watch?v=…"
            required
            className="text-start"
          />
        </div>
        <Button type="submit" variant="brand" disabled={saving || !parsed}>
          <LinkIcon className="size-4" />
          {saving ? dict.common.saving : dict.common.add}
        </Button>
      </form>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Info className="size-3.5" />
          {t.linkNote}
        </span>
        {url.trim() && (
          <span
            className={
              parsed ? "flex items-center gap-1.5 text-success" : "flex items-center gap-1.5 text-destructive"
            }
          >
            <LinkIcon className="size-3.5" />
            {parsed ? providerLabel(parsed.provider) : t.invalidLink}
          </span>
        )}
      </p>
    </>
  );
}

/** Both ways of adding a video, behind one pair of tabs. */
function AddVideoCard({ dict }: { dict: Dictionary }) {
  const t = dict.videos;
  const [mode, setMode] = useState<"upload" | "link">("upload");

  const tab = (value: "upload" | "link", label: string, Icon: typeof Upload) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        mode === value
          ? "bg-brand/15 text-brand"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="size-5 text-brand" />
          {t.addTitle}
        </CardTitle>
        <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
          {tab("upload", t.fromDevice, Upload)}
          {tab("link", t.fromLink, LinkIcon)}
        </div>
      </CardHeader>
      <CardContent>
        {mode === "upload" ? <UploadCard dict={dict} /> : <LinkForm dict={dict} />}
      </CardContent>
    </Card>
  );
}

function EditForm({
  video,
  dict,
  onDone,
}: {
  video: VideoRow;
  dict: Dictionary;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(editVideo, emptyState);
  useEffect(() => {
    if (state.ok) onDone();
    else if (state.error) toast.error(dict.common.somethingWrong);
  }, [state, onDone, dict.common.somethingWrong]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={video.id} />
      <div className="space-y-2">
        <Label htmlFor="exerciseName">{dict.videos.exerciseName}</Label>
        <Input id="exerciseName" name="exerciseName" defaultValue={video.exerciseName} required />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? dict.common.saving : dict.common.save}
        </Button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  video,
  dict,
  onDone,
}: {
  video: VideoRow;
  dict: Dictionary;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-muted/50 p-3 text-sm font-medium">{video.exerciseName}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await deleteVideo(video.id);
              toast.success(dict.videos.deleted);
              onDone();
            })
          }
        >
          <Trash2 className="size-4" />
          {dict.common.delete}
        </Button>
      </div>
    </div>
  );
}
