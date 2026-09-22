import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";
export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        urlTransform={(url, key) =>
          key === "src" && /^data:image\/(png|jpeg|webp);base64,/.test(url)
            ? url
            : defaultUrlTransform(url)
        }
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt || "文章插图"} loading="lazy" />
          ),
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
