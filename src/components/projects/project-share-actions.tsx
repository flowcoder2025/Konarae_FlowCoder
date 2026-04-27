"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ProjectShareActionsProps {
  title: string;
  description: string;
  url: string;
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized?: () => boolean;
      init?: (key: string) => void;
      Share?: { sendDefault: (payload: unknown) => void };
    };
  }
}

export function ProjectShareActions({ title, description, url }: ProjectShareActionsProps) {
  const [message, setMessage] = useState<string | null>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("링크를 복사했습니다");
    } catch {
      setMessage("링크 복사에 실패했습니다");
    }
  }

  async function shareKakao() {
    const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY;
    if (!key || !window.Kakao?.Share) {
      await copyLink();
      return;
    }

    if (!window.Kakao.isInitialized?.()) {
      window.Kakao.init?.(key);
    }

    window.Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title,
        description,
        imageUrl: `${window.location.origin}/opengraph-image.png`,
        link: { mobileWebUrl: url, webUrl: url },
      },
      buttons: [{ title: "지원사업 보기", link: { mobileWebUrl: url, webUrl: url } }],
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={copyLink}>링크 복사</Button>
      <Button onClick={shareKakao}>카카오톡 공유</Button>
      {message && <span className="text-sm text-muted-foreground" role="status">{message}</span>}
    </div>
  );
}
