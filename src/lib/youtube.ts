// Parse a YouTube URL or raw ID into a video ID.
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Raw 11-char video id
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const host = url.hostname.replace(/^www\./, "");

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    // youtube.com/watch?v=<id>
    if (host.endsWith("youtube.com") || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // youtube.com/shorts/<id>, /embed/<id>, /v/<id>, /live/<id>
      const parts = url.pathname.split("/").filter(Boolean);
      const knownPrefixes = ["shorts", "embed", "v", "live"];
      if (parts.length >= 2 && knownPrefixes.includes(parts[0])) {
        const id = parts[1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    // fallthrough
  }
  return null;
}

// Parse a YouTube / YouTube Music playlist URL (or raw playlist ID) into
// an ID suitable for playlistItems.list. Accepts the `list=` query param
// on watch / playlist / music.youtube.com links. Returns null when the
// input isn't recognizable.
export function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // Raw ID: usually 13–40 chars starting with PL/LL/RD/OL/UU/FL/LM/PU,
  // but accept anything that matches the YouTube character set.
  if (/^[A-Za-z0-9_-]{10,}$/.test(s) && !s.startsWith("http")) return s;

  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    const list = url.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]+$/.test(list)) return list;
  } catch {
    /* not a URL */
  }
  return null;
}

// Fetch video title + thumbnail via YouTube's public oEmbed endpoint.
// No API key required; returns null on failure.
export async function fetchVideoMeta(
  videoId: string,
): Promise<{ title: string; thumbnail: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return {
        title: "YouTube video",
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
    const data = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title ?? "YouTube video",
      thumbnail:
        data.thumbnail_url ??
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      title: "YouTube video",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}
