import { Readability, isProbablyReaderable } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "./turndown";
import opengraph_scraper from "open-graph-scraper";
import { getSubtitles } from "youtube-captions-scraper";
import pdf2md from "@opendocsg/pdf2md";

/**
 * Interface for Open Graph data.
 */
interface OgObject {
  ogTitle?: string;
  ogDescription?: string;
  ogDate?: string;
  ogImage?: Array<{ url: string }>;
}

export const scrape = async ({
  url,
  markdown,
}: {
  url: string;
  markdown: boolean;
}) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
    },
  });
  const html = await response.text();
  const article = await extract(html, new URL(url));

  if (article == null) {
    return null;
  }

  if (markdown) {
    const textContent = convertToMarkdown(article.content);
    return { ...article, textContent };
  } else {
    const content = cleanString(article.content);
    const textContent = cleanString(article.textContent);

    return { ...article, content, textContent };
  }
};

const extract = async (html: string, url: URL) => {
  const doc = new JSDOM(html, { url: url.href });
  const document = doc.window.document;

  if (isProbablyReaderable(document, { minContentLength: document.body.textContent.length / 3 })) {
    let reader = new Readability(document);
    return reader.parse();
  } else {
    const ogData = await parseOg(html);
    const ogMarkdown = ogToMarkdown(ogData);
    return { content: ogMarkdown, textContent: document.body.textContent };
  }
};

const convertToMarkdown = (html: string) => {
  const turndown = new TurndownService();
  const doc = new JSDOM(html);
  return turndown.turndown(doc.window.document);
};

const cleanString = (str: string) =>
  str
    .replace(/[\s\t\u200B-\u200D\uFEFF]+/g, " ")
    .replace(/^\s+/gm, "")
    .replace(/\n+/g, "\n");

const parseOg = async (html: string): Promise<OgObject> => {
  const options = { html, timeout: 10000 };
  const ret = await opengraph_scraper(options);
  return ret.result;
};

const ogToMarkdown = (ogData: OgObject): string => {
  const { ogTitle, ogDescription, ogImage, ogDate } = ogData;
  let markdown = "";

  if (ogTitle) markdown += `# ${ogTitle}\n\n`;
  if (ogDate) {
    const formattedDate = new Date(ogDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    markdown += `*${formattedDate}*\n\n`;
  }
  const imgURL = ogImage ? ogImage[0]?.url : undefined;
  if (imgURL) markdown += `![Thumbnail](${imgURL})\n\n`;
  if (ogDescription) markdown += `${ogDescription}\n\n`;

  return markdown;
};

const scrapeableUrl = (url: URL): { url: URL; redirect: "follow" | "manual"; userAgent: string } => {
  const twitter = /^(?:.*\.)?(twitter\.com|x\.com)$/i;
  const reddit = /^(?:.*\.)?(www\.)?(reddit\.com|redd\.it)$/i;
  const defaults = { userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" };

  if (twitter.test(url.host)) {
    url.host = "fxtwitter.com";
    return { ...defaults, url, redirect: "manual" };
  } else if (reddit.test(url.host)) {
    url.host = "old.reddit.com";
    return { ...defaults, url, redirect: "manual" };
  }
  return { ...defaults, url, redirect: "follow" };
};

const getYoutubeVideoID = (url: URL): string | null => {
  const regExp = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
  const match = url.href.match(regExp);
  return match ? match[1] : null;
};
