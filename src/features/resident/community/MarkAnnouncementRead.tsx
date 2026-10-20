"use client";

import { useEffect, useRef } from "react";

import { browserApi } from "@/lib/api/browser";

/**
 * Records the read receipt of an announcement once it is on screen (`POST …/actions/read`, D-073). A failure is
 * silent: the next open tries again, and reading never depends on it.
 */
export function MarkAnnouncementRead({ announcementId }: { announcementId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void browserApi
      .POST("/v1/resident/announcements/{announcementId}/actions/read", { params: { path: { announcementId } } })
      .catch(() => undefined);
  }, [announcementId]);
  return null;
}
