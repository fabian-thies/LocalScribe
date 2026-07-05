import type { ReactNode } from "react";
import { t } from "../services/i18n";

interface FormattedMarkdownProps {
  text: string;
  emptyText?: string;
}

type MarkdownBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function FormattedMarkdown({ text, emptyText }: FormattedMarkdownProps) {
  const blocks = parseMarkdownBlocks(text);

  if (blocks.length === 0) {
    return <p className="text-muted">{emptyText ?? t("no.content.available")}</p>;
  }

  return (
    <div className="grid gap-[9px] text-text break-words">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 2) {
            return <h2 key={`heading-${index}`} className="text-[15px] leading-[1.35] mt-1 mb-0">{block.text}</h2>;
          }
          return <h3 key={`heading-${index}`} className="leading-[1.35] mt-1 mb-0">{block.text}</h3>;
        }

        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="grid gap-[5px] pl-[18px] m-0">
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="leading-[1.5]">{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`para-${index}`} className="leading-[1.5] mb-0">{renderInlineMarkdown(block.text)}</p>
        );
      })}
    </div>
  );
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let listItems: string[] = [];

  function flushList(): void {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1].trim());
      continue;
    }

    flushList();

    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 2 | 3, text: normalizeGermanHeading(stripOuterBold(heading[2])) });
      continue;
    }

    const legacyHeading = line.match(/^\*\*(.+?)\*\*:?\s*$/);
    if (legacyHeading) {
      blocks.push({ type: "heading", level: 3, text: normalizeGermanHeading(stripTrailingColon(legacyHeading[1])) });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
  }

  flushList();
  return blocks;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    nodes.push(<strong key={`${match.index}-${match[1]}`} className="font-[750]">{match[1]}</strong>);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length ? nodes : [text];
}

function stripOuterBold(text: string): string {
  const match = text.trim().match(/^\*\*(.+?)\*\*:?\s*$/);
  return match ? stripTrailingColon(match[1]) : text.trim();
}

function stripTrailingColon(text: string): string {
  return text.trim().replace(/:$/, "");
}

function normalizeGermanHeading(text: string): string {
  return text
    .replace(/\bAe/g, "\u00c4")
    .replace(/\bOe/g, "\u00d6")
    .replace(/\bUe/g, "\u00dc")
    .replace(/ae/g, "\u00e4")
    .replace(/oe/g, "\u00f6")
    .replace(/ue/g, "\u00fc");
}
