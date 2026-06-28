import {
  FONT_FAMILY,
  VERTICAL_ALIGN,
  escapeDoubleQuotes,
  getFontString,
} from "@excalidraw/common";

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { MarkRequired } from "@excalidraw/common/utility-types";

import { newTextElement } from "./newElement";
import { wrapText } from "./textWrapping";
import { isIframeElement } from "./typeChecks";

import type {
  ExcalidrawElement,
  ExcalidrawIframeLikeElement,
  IframeData,
} from "./types";

type IframeDataWithSandbox = MarkRequired<IframeData, "sandbox">;

const embeddedLinkCache = new Map<string, IframeDataWithSandbox>();

const RE_YOUTUBE =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?youtu(?:be\.com|\.be)\/(embed\/|watch\?v=|shorts\/|playlist\?list=|embed\/videoseries\?list=)?([a-zA-Z0-9_-]+)/;

const RE_VIMEO =
  /^(?:http(?:s)?:\/\/)?(?:(?:w){3}\.)?(?:player\.)?vimeo\.com\/(?:video\/)?([^?\s]+)(?:\?.*)?$/;
const RE_FIGMA = /^https:\/\/(?:www\.)?figma\.com/;

const RE_GH_GIST = /^https:\/\/gist\.github\.com\/([\w_-]+)\/([\w_-]+)/;
const RE_GH_GIST_EMBED =
  /^<script[\s\S]*?\ssrc=["'](https:\/\/gist\.github\.com\/.*?)\.js["']/i;

// Engineering link-card providers: GitHub / GitLab / Linear / Jira. These hosts
// all block iframe embedding (X-Frame-Options), so instead of a dead iframe we
// render a self-contained, strictly-sandboxed link card (see createLinkCardSrcDoc).
// A per-host catch-all guarantees ANY URL on these hosts becomes a card, never a
// blocked generic iframe. (gist.github.com is a distinct host handled above.)
const RE_GH_PR_ISSUE =
  /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)/;
const RE_GH_BLOB =
  /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/]+\/([^#?\s]+?)(?:#L(\d+)(?:-L(\d+))?)?$/;
const RE_GH_GENERIC = /^https:\/\/github\.com\//;
const RE_GITLAB =
  /^https:\/\/gitlab\.com\/(.+?)\/-\/(merge_requests|issues)\/(\d+)/;
const RE_GITLAB_GENERIC = /^https:\/\/gitlab\.com\//;
const RE_LINEAR = /^https:\/\/linear\.app\/[\w-]+\/issue\/([A-Za-z0-9]+-\d+)/;
const RE_LINEAR_GENERIC = /^https:\/\/linear\.app\//;
const RE_JIRA =
  /^https:\/\/([\w-]+)\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/;
const RE_JIRA_GENERIC = /^https:\/\/[\w-]+\.atlassian\.net\//;

const RE_MSFORMS = /^(?:https?:\/\/)?forms\.microsoft\.com\//;

// not anchored to start to allow <blockquote> twitter embeds
const RE_TWITTER =
  /(?:https?:\/\/)?(?:(?:w){3}\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/;
const RE_TWITTER_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:twitter|x)\.com\/[^"']*)/i;

const RE_VALTOWN =
  /^https:\/\/(?:www\.)?val\.town\/(v|embed)\/[a-zA-Z_$][0-9a-zA-Z_$]+\.[a-zA-Z_$][0-9a-zA-Z_$]+/;

const RE_GENERIC_EMBED =
  /^<(?:iframe|blockquote)[\s\S]*?\s(?:src|href)=["']([^"']*)["'][\s\S]*?>$/i;

const RE_GIPHY =
  /giphy.com\/(?:clips|embed|gifs)\/[a-zA-Z0-9]*?-?([a-zA-Z0-9]+)(?:[^a-zA-Z0-9]|$)/;

const RE_REDDIT =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

const RE_REDDIT_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:www\.)?reddit\.com\/[^"']*)/i;

const parseYouTubeLikeTimestamp = (url: string): number => {
  let timeParam: string | null | undefined;

  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    timeParam =
      urlObj.searchParams.get("t") || urlObj.searchParams.get("start");
  } catch (error) {
    const timeMatch = url.match(/[?&#](?:t|start)=([^&#\s]+)/);
    timeParam = timeMatch?.[1];
  }

  if (!timeParam) {
    return 0;
  }

  if (/^\d+$/.test(timeParam)) {
    return parseInt(timeParam, 10);
  }

  const timeMatch = timeParam.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!timeMatch) {
    return 0;
  }

  const [, hours = "0", minutes = "0", seconds = "0"] = timeMatch;
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
};

const parseGoogleDriveVideoLink = (
  url: string,
): { fileId: string; resourceKey?: string; timestamp?: number } | null => {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    const hostname = urlObj.hostname.replace(/^www\./, "");
    if (hostname !== "drive.google.com") {
      return null;
    }

    let fileId: string | null = null;
    const pathMatch = urlObj.pathname.match(/^\/file\/d\/([^/]+)(?:\/|$)/);
    if (pathMatch?.[1]) {
      fileId = pathMatch[1];
    } else if (urlObj.pathname === "/open" || urlObj.pathname === "/uc") {
      // Shared Drive links can be emitted as:
      // - /open?id=<fileId> (common "open in Drive" format)
      // - /uc?...&id=<fileId> (download/export endpoint often seen in copied links)
      fileId = urlObj.searchParams.get("id");
    }

    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return null;
    }

    // Some Drive share links include `resourcekey` for access to link-shared
    // files; preserve it in the preview URL so embeds keep working.
    const resourceKey = urlObj.searchParams.get("resourcekey");
    const timestamp = parseYouTubeLikeTimestamp(urlObj.toString());

    return {
      fileId,
      resourceKey:
        resourceKey && /^[a-zA-Z0-9_-]+$/.test(resourceKey)
          ? resourceKey
          : undefined,
      // Drive accepts YouTube-like `t` formats (e.g. `t=90`, `t=1m30s`);
      // normalize to seconds for a stable preview URL.
      timestamp: timestamp > 0 ? timestamp : undefined,
    };
  } catch (error) {
    return null;
  }
};

const ALLOWED_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "drive.google.com",
  "figma.com",
  "link.excalidraw.com",
  "gist.github.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "val.town",
  "giphy.com",
  "reddit.com",
  "forms.microsoft.com",
  // Engineering link-card hosts (rendered as inert cards, NOT in ALLOW_SAME_ORIGIN).
  "github.com",
  "gitlab.com",
  "linear.app",
  "*.atlassian.net",
]);

const ALLOW_SAME_ORIGIN = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "drive.google.com",
  "figma.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "reddit.com",
  "forms.microsoft.com",
]);

export const createSrcDoc = (body: string) => {
  return `<html><body>${body}</body></html>`;
};

// Escape text content for safe HTML interpolation. @excalidraw/common only
// exposes escapeDoubleQuotes (for attributes), so we add the full text-content
// escape here. Used for every interpolated value in a link card. (Security.)
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// A self-contained, theme-aware link card for providers that block iframe
// embedding (GitHub/GitLab/Linear/Jira). It contains NO remote iframe/script/img
// — every interpolated value is escaped and the only network affordance is the
// click-through <a> — so it is safe to render under a strict sandbox
// (allowSameOrigin:false). Returns a theme→html function like the other
// document embeds (Twitter/Reddit/gist), so one cache entry serves both themes.
const createLinkCardSrcDoc =
  (opts: { provider: string; title: string; subtitle?: string; url: string }) =>
  (theme: string): string => {
    const dark = theme === "dark";
    const bg = dark ? "#232329" : "#ffffff";
    const fg = dark ? "#e3e3e8" : "#1b1b1f";
    const muted = dark ? "#9b9ba4" : "#646469";
    const border = dark ? "#3b3b42" : "#e6e6e9";
    const chipBg = dark ? "#33333b" : "#f1f3f5";
    const provider = escapeHtml(opts.provider);
    const title = escapeHtml(opts.title);
    const subtitle = opts.subtitle ? escapeHtml(opts.subtitle) : "";
    // escapeHtml (not just escapeDoubleQuotes) so the href attribute carries no
    // raw <,>,& either — fully inert even with a hostile path. The browser
    // decodes the entities back to the real URL on click.
    const href = escapeHtml(opts.url);
    const urlText = escapeHtml(opts.url);
    return createSrcDoc(
      `<style>
        html,body{margin:0;height:100%}
        a.card{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;height:100%;
          padding:18px 20px;text-decoration:none;
          font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
          background:${bg};color:${fg};border:1px solid ${border};border-radius:12px}
        .chip{align-self:flex-start;font-size:11px;font-weight:600;letter-spacing:.04em;
          text-transform:uppercase;color:${muted};background:${chipBg};
          border:1px solid ${border};border-radius:999px;padding:3px 10px}
        .title{font-size:17px;font-weight:650;line-height:1.25;color:${fg}}
        .subtitle{font-size:14px;color:${muted}}
        .url{margin-top:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:12px;color:${muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      </style>
      <a class="card" href="${href}" target="_blank" rel="noopener noreferrer">
        <span class="chip">${provider}</span>
        <span class="title">${title}</span>
        ${subtitle ? `<span class="subtitle">${subtitle}</span>` : ""}
        <span class="url">${urlText}</span>
      </a>`,
    );
  };

// Build + cache + return a link-card embed. allowSameOrigin is false for every
// card host (none are in ALLOW_SAME_ORIGIN), keeping the sandbox strict.
const cardResult = (
  cacheKey: string,
  provider: string,
  title: string,
  subtitle: string | undefined,
  allowSameOrigin: boolean,
): IframeDataWithSandbox => {
  const ret: IframeDataWithSandbox = {
    type: "document",
    srcdoc: createLinkCardSrcDoc({ provider, title, subtitle, url: cacheKey }),
    intrinsicSize: { w: 460, h: 180 },
    sandbox: { allowSameOrigin },
  };
  embeddedLinkCache.set(cacheKey, ret);
  return ret;
};

// host + path of a URL, trailing slash trimmed — the catch-all card title.
// Goes through `new URL`, which percent-encodes <, >, " in the path.
const stripUrlOrigin = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return url;
  }
};

export const getEmbedLink = (
  link: string | null | undefined,
): IframeDataWithSandbox | null => {
  if (!link) {
    return null;
  }

  if (embeddedLinkCache.has(link)) {
    return embeddedLinkCache.get(link)!;
  }

  const originalLink = link;

  const allowSameOrigin = ALLOW_SAME_ORIGIN.has(
    matchHostname(link, ALLOW_SAME_ORIGIN) || "",
  );

  let type: "video" | "generic" = "generic";
  let aspectRatio = { w: 560, h: 840 };
  const ytLink = link.match(RE_YOUTUBE);
  if (ytLink?.[2]) {
    const startTime = parseYouTubeLikeTimestamp(originalLink);
    const time = startTime > 0 ? `&start=${startTime}` : ``;
    const isPortrait = link.includes("shorts");
    type = "video";
    switch (ytLink[1]) {
      case "embed/":
      case "watch?v=":
      case "shorts/":
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
      case "playlist?list=":
      case "embed/videoseries?list=":
        link = `https://www.youtube.com/embed/videoseries?list=${ytLink[2]}&enablejsapi=1${time}`;
        break;
      default:
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
    }
    aspectRatio = isPortrait ? { w: 315, h: 560 } : { w: 560, h: 315 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const vimeoLink = link.match(RE_VIMEO);
  if (vimeoLink?.[1]) {
    const target = vimeoLink?.[1];
    const error = !/^\d+$/.test(target)
      ? new URIError("Invalid embed link format")
      : undefined;
    type = "video";
    link = `https://player.vimeo.com/video/${target}?api=1`;
    aspectRatio = { w: 560, h: 315 };
    //warning deliberately ommited so it is displayed only once per link
    //same link next time will be served from cache
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      error,
      sandbox: { allowSameOrigin },
    };
  }

  const googleDriveVideo = parseGoogleDriveVideoLink(link);
  if (googleDriveVideo) {
    type = "video";
    const searchParams = new URLSearchParams();
    if (googleDriveVideo.resourceKey) {
      searchParams.set("resourcekey", googleDriveVideo.resourceKey);
    }
    if (googleDriveVideo.timestamp) {
      searchParams.set("t", `${googleDriveVideo.timestamp}`);
    }

    const search = searchParams.toString();
    link = `https://drive.google.com/file/d/${googleDriveVideo.fileId}/preview${
      search ? `?${search}` : ""
    }`;
    aspectRatio = { w: 560, h: 315 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const figmaLink = link.match(RE_FIGMA);
  if (figmaLink) {
    type = "generic";
    link = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(
      link,
    )}`;
    aspectRatio = { w: 550, h: 550 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const valLink = link.match(RE_VALTOWN);
  if (valLink) {
    link =
      valLink[1] === "embed" ? valLink[0] : valLink[0].replace("/v", "/embed");
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  if (RE_MSFORMS.test(link) && !link.includes("embed=true")) {
    link += link.includes("?") ? "&embed=true" : "?embed=true";
  }

  if (RE_TWITTER.test(link)) {
    const postId = link.match(RE_TWITTER)![1];
    // the embed srcdoc still supports twitter.com domain only.
    // Note that we don't attempt to parse the username as it can consist of
    // non-latin1 characters, and the username in the url can be set to anything
    // without affecting the embed.
    const safeURL = escapeDoubleQuotes(
      `https://twitter.com/x/status/${postId}`,
    );

    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="twitter-tweet" data-dnt="true" data-theme="${theme}"><a href="${safeURL}"></a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_REDDIT.test(link)) {
    const [, page, postId, title] = link.match(RE_REDDIT)!;
    const safeURL = escapeDoubleQuotes(
      `https://reddit.com/r/${page}/comments/${postId}/${title}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="reddit-embed-bq" data-embed-theme="${theme}"><a href="${safeURL}"></a><br></blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_GH_GIST.test(link)) {
    const [, user, gistId] = link.match(RE_GH_GIST)!;
    const safeURL = escapeDoubleQuotes(
      `https://gist.github.com/${user}/${gistId}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: () =>
        createSrcDoc(`
          <script src="${safeURL}.js"></script>
          <style type="text/css">
            * { margin: 0px; }
            table, .gist { height: 100%; }
            .gist .gist-file { height: calc(100vh - 2px); padding: 0px; display: grid; grid-template-rows: 1fr auto; }
          </style>
        `),
      intrinsicSize: { w: 550, h: 720 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(link, ret);
    return ret;
  }

  // --- Engineering link cards: GitHub / GitLab / Linear / Jira ---
  // Each host blocks iframe embedding, so we render an inert, strictly-sandboxed
  // link card (allowSameOrigin is false — none are in ALLOW_SAME_ORIGIN). The
  // per-host catch-all ensures no URL on these hosts falls through to the blocked
  // generic iframe below.
  const ghPrIssue = link.match(RE_GH_PR_ISSUE);
  if (ghPrIssue) {
    const [, owner, repo, kind, num] = ghPrIssue;
    return cardResult(
      originalLink,
      "GitHub",
      `${owner}/${repo}`,
      `${kind === "pull" ? "Pull Request" : "Issue"} #${num}`,
      allowSameOrigin,
    );
  }
  const ghBlob = link.match(RE_GH_BLOB);
  if (ghBlob) {
    const [, owner, repo, path, l1, l2] = ghBlob;
    const file = path.split("/").pop() || path;
    const lines = l1 ? (l2 ? ` · L${l1}-L${l2}` : ` · L${l1}`) : "";
    return cardResult(
      originalLink,
      "GitHub",
      `${owner}/${repo}`,
      `${file}${lines}`,
      allowSameOrigin,
    );
  }
  if (RE_GH_GENERIC.test(link)) {
    return cardResult(
      originalLink,
      "GitHub",
      stripUrlOrigin(originalLink),
      undefined,
      allowSameOrigin,
    );
  }
  const gitlab = link.match(RE_GITLAB);
  if (gitlab) {
    const [, repoPath, kind, num] = gitlab;
    return cardResult(
      originalLink,
      "GitLab",
      repoPath,
      `${kind === "merge_requests" ? "Merge Request" : "Issue"} !${num}`,
      allowSameOrigin,
    );
  }
  if (RE_GITLAB_GENERIC.test(link)) {
    return cardResult(
      originalLink,
      "GitLab",
      stripUrlOrigin(originalLink),
      undefined,
      allowSameOrigin,
    );
  }
  const linear = link.match(RE_LINEAR);
  if (linear) {
    return cardResult(originalLink, "Linear", linear[1], "Issue", allowSameOrigin);
  }
  if (RE_LINEAR_GENERIC.test(link)) {
    return cardResult(
      originalLink,
      "Linear",
      stripUrlOrigin(originalLink),
      undefined,
      allowSameOrigin,
    );
  }
  const jira = link.match(RE_JIRA);
  if (jira) {
    const [, site, key] = jira;
    return cardResult(
      originalLink,
      "Jira",
      key,
      `${site}.atlassian.net`,
      allowSameOrigin,
    );
  }
  if (RE_JIRA_GENERIC.test(link)) {
    return cardResult(
      originalLink,
      "Jira",
      stripUrlOrigin(originalLink),
      undefined,
      allowSameOrigin,
    );
  }

  embeddedLinkCache.set(link, {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  });
  return {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  };
};

export const createPlaceholderEmbeddableLabel = (
  element: ExcalidrawIframeLikeElement,
): ExcalidrawElement => {
  let text: string;
  if (isIframeElement(element)) {
    text = "IFrame element";
  } else {
    text =
      !element.link || element?.link === "" ? "Empty Web-Embed" : element.link;
  }

  const fontSize = Math.max(
    Math.min(element.width / 2, element.width / text.length),
    element.width / 30,
  );
  const fontFamily = FONT_FAMILY.Helvetica;

  const fontString = getFontString({
    fontSize,
    fontFamily,
  });

  return newTextElement({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
    strokeColor:
      element.strokeColor !== "transparent" ? element.strokeColor : "black",
    backgroundColor: "transparent",
    fontFamily,
    fontSize,
    text: wrapText(text, fontString, element.width - 20),
    textAlign: "center",
    verticalAlign: VERTICAL_ALIGN.MIDDLE,
    angle: element.angle ?? 0,
  });
};

const matchHostname = (
  url: string,
  /** using a Set assumes it already contains normalized bare domains */
  allowedHostnames: Set<string> | string,
): string | null => {
  try {
    const { hostname } = new URL(url);

    const bareDomain = hostname.replace(/^www\./, "");

    if (allowedHostnames instanceof Set) {
      if (ALLOWED_DOMAINS.has(bareDomain)) {
        return bareDomain;
      }

      const bareDomainWithFirstSubdomainWildcarded = bareDomain.replace(
        /^([^.]+)/,
        "*",
      );
      if (ALLOWED_DOMAINS.has(bareDomainWithFirstSubdomainWildcarded)) {
        return bareDomainWithFirstSubdomainWildcarded;
      }
      return null;
    }

    const bareAllowedHostname = allowedHostnames.replace(/^www\./, "");
    if (bareDomain === bareAllowedHostname) {
      return bareAllowedHostname;
    }
  } catch (error) {
    // ignore
  }
  return null;
};

export const maybeParseEmbedSrc = (str: string): string => {
  const twitterMatch = str.match(RE_TWITTER_EMBED);
  if (twitterMatch && twitterMatch.length === 2) {
    return twitterMatch[1];
  }

  const redditMatch = str.match(RE_REDDIT_EMBED);
  if (redditMatch && redditMatch.length === 2) {
    return redditMatch[1];
  }

  const gistMatch = str.match(RE_GH_GIST_EMBED);
  if (gistMatch && gistMatch.length === 2) {
    return gistMatch[1];
  }

  if (RE_GIPHY.test(str)) {
    return `https://giphy.com/embed/${RE_GIPHY.exec(str)![1]}`;
  }

  const match = str.match(RE_GENERIC_EMBED);
  if (match && match.length === 2) {
    return match[1];
  }

  return str;
};

export const embeddableURLValidator = (
  url: string | null | undefined,
  validateEmbeddable: ExcalidrawProps["validateEmbeddable"],
): boolean => {
  if (!url) {
    return false;
  }
  if (validateEmbeddable != null) {
    if (typeof validateEmbeddable === "function") {
      const ret = validateEmbeddable(url);
      // if return value is undefined, leave validation to default
      if (typeof ret === "boolean") {
        return ret;
      }
    } else if (typeof validateEmbeddable === "boolean") {
      return validateEmbeddable;
    } else if (validateEmbeddable instanceof RegExp) {
      return validateEmbeddable.test(url);
    } else if (Array.isArray(validateEmbeddable)) {
      for (const domain of validateEmbeddable) {
        if (domain instanceof RegExp) {
          if (url.match(domain)) {
            return true;
          }
        } else if (matchHostname(url, domain)) {
          return true;
        }
      }
      return false;
    }
  }

  return !!matchHostname(url, ALLOWED_DOMAINS);
};
