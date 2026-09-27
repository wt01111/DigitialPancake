import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { unified } from "unified";
import remarkParse from "remark-parse";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

const STYLE_LINK = /^dp-style:(blue|red|orange|green|purple)-(sans|serif|mono)$/;

function nodeText(node) {
  if (!node) return "";
  if (node.type === "image" || node.type === "imageReference") return node.alt || "";
  if (node.type === "break") return " ";
  if (typeof node.value === "string") return node.value;
  return (node.children || []).map(nodeText).join("");
}

function headingSlug(text) {
  const words = String(text || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .match(/[\p{L}\p{N}]+/gu);
  return words?.join("-") || "section";
}

export function markdownHeadings(source) {
  const tree = unified().use(remarkParse).parse(String(source || ""));
  const seen = new Map();
  const headings = [];
  const visit = (node) => {
    if (node.type === "blockquote") return;
    if (node.type === "heading") {
      const text = nodeText(node).trim();
      const base = headingSlug(text);
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      headings.push({
        depth: node.depth,
        text: text || "未命名标题",
        id: count === 1 ? base : `${base}-${count}`,
        offset: node.position?.start?.offset,
      });
    }
    for (const child of node.children || []) visit(child);
  };
  visit(tree);
  return headings;
}

function TableOfContents({ headings }) {
  const follow = (event, id) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
  };
  return (
    <aside className="markdown-toc" aria-label="文章目录">
      <details open>
        <summary>文章目录</summary>
        <nav>
          {headings.map((heading) => (
            <a
              key={`${heading.offset}-${heading.id}`}
              className={`toc-level-${heading.depth}`}
              href={`#${heading.id}`}
              onClick={(event) => follow(event, heading.id)}
            >
              {heading.text}
            </a>
          ))}
        </nav>
      </details>
    </aside>
  );
}

export default function Markdown({ children, toc = false }) {
  const source = String(children || "");
  const headings = useMemo(() => (toc ? markdownHeadings(source) : []), [source, toc]);
  const headingByOffset = useMemo(
    () => new Map(headings.map((heading) => [heading.offset, heading])),
    [headings],
  );
  const headingComponent = (Tag) =>
    function Heading({ node, children: headingChildren }) {
      const heading = headingByOffset.get(node?.position?.start?.offset);
      return <Tag id={heading?.id}>{headingChildren}</Tag>;
    };
  const content = (
    <div className="markdown">
      <ReactMarkdown
        urlTransform={(url, key) => {
          if (key === "href" && STYLE_LINK.test(url)) return url;
          if (key === "src" && /^data:image\/(png|jpeg|webp);base64,/.test(url)) return url;
          return defaultUrlTransform(url);
        }}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          h1: headingComponent("h1"),
          h2: headingComponent("h2"),
          h3: headingComponent("h3"),
          h4: headingComponent("h4"),
          h5: headingComponent("h5"),
          h6: headingComponent("h6"),
          a: ({ children: linkChildren, href }) => {
            const match = STYLE_LINK.exec(href || "");
            if (match) {
              return (
                <span className={`md-accent md-color-${match[1]} md-font-${match[2]}`}>
                  {linkChildren}
                </span>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {linkChildren}
              </a>
            );
          },
          img: ({ src, alt }) => (
            <img src={src} alt={alt || "文章插图"} loading="lazy" />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
  if (!toc || headings.length === 0) return content;
  return (
    <div className="markdown-with-toc">
      {content}
      <TableOfContents headings={headings} />
    </div>
  );
}
