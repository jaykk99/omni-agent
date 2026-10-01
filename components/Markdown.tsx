"use client";

import { Children, useState, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard API unavailable (non-secure context) — legacy fallback.
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="md-code-lang">{language || "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="md-code-copy"
          aria-label="Copy code"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Renders assistant Markdown: GFM tables/lists, external links, and fenced
 *  code blocks with a copy button. Inline code stays inline. */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            // A fenced block arrives as <pre><code class="language-x">…
            const codeEl = Children.only(children) as ReactElement<{
              className?: string;
              children?: React.ReactNode;
            }>;
            const className = codeEl?.props?.className ?? "";
            const match = /language-([\w+-]+)/.exec(className);
            const code = String(codeEl?.props?.children ?? "").replace(
              /\n$/,
              ""
            );
            return <CodeBlock language={match?.[1] ?? ""} code={code} />;
          },
          // Inline code only — blocks are handled by `pre` above.
          code({ node: _node, children, ...props }) {
            return (
              <code className="md-inline-code" {...props}>
                {children}
              </code>
            );
          },
          a({ node: _node, children, href }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          img({ node: _node, alt, src }) {
            // next/image can't optimize remote/model-generated URLs; plain img
            // is the honest choice here.
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={src} alt={alt ?? ""} loading="lazy" />;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
