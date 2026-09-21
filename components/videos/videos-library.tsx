"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Video, Upload, Play, Pencil, Trash2, ShieldCheck, Info } from "lucide-react";
import { MAX_VIDEO_BYTES, isAcceptedVideoType } from "@/lib/video-formats";
import { editVideo, deleteVideo } from "@/app/actions/videos";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import type { Dictionary } from "@/lib/i18n";

export type VideoRow = {
  id: string;
  exerciseName: string;
  hiddenToken: string;
  addedByName: string | null;
  createdAt: string;
};

export function VideosLibrary({ videos, dict }: { videos: VideoRow[]; dict: Dictionary }) {
  const t = dict.videos;
  const [preview, setPreview] = useState<VideoRow | null>(null);
  const [editing, setEditing] = useState<VideoRow | null>(null);
  const [deleting, setDeleting] = useState<VideoRow | null>(null);

  return (
    <div className="space-y-6">
      <UploadCard dict={dict} />

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
                  <p className="line-clamp-2 font-medium">{v.exerciseName}</p>
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
        {preview && (
          <div
            className="select-none overflow-hidden rounded-lg bg-black"
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          >
            <video
              key={preview.id}
              controls
              autoPlay
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              controlsList="nodownload noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
              className="w-full"
              src={`/api/videos/stream/${preview.hiddenToken}`}
            />
          </div>
        )}
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

function UploadCard({ dict }: { dict: Dictionary }) {
  const t = dict.videos;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error(t.fileRequired);
    if (!name.trim()) return toast.error(t.exerciseName);
    if (!isAcceptedVideoType(file.type)) return toast.error(t.invalidFile);
    // Checked again on the server; this just saves a pointless upload.
    if (file.size > MAX_VIDEO_BYTES) return toast.error(t.fileTooLarge);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("exerciseName", name.trim());

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos/upload");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 200) {
        toast.success(t.uploaded);
        setName("");
        setFile(null);
        formRef.current?.reset();
        router.refresh();
      } else if (xhr.status === 413) {
        toast.error(t.fileTooLarge);
      } else if (xhr.status === 415) {
        toast.error(t.invalidFile);
      } else {
        toast.error(dict.common.somethingWrong);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      toast.error(dict.common.somethingWrong);
    };
    xhr.send(fd);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="size-5 text-brand" />
          {t.uploadTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
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
