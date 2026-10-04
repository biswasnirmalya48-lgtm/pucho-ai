import { Children, isValidElement, memo, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import hljs from 'highlight.js/lib/common'
import { Check, Copy } from 'lucide-react'

import { dict } from '../lib/store'

/** Highlight a code string. hljs escapes HTML in its output. */
function highlight(code: string, language: string) {
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    return null
  }
}

const CodeBlock = memo(function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)
  const html = useMemo(() => highlight(code, language), [code, language])
  const t = dict()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked — the code is still selectable */
    }
  }

  return (
    <div className="code-block">
      <div className="code-block__bar">
        <span className="code-block__lang">{language || 'code'}</span>
        <button type="button" className="code-block__copy" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? t.copied : t.copy}</span>
        </button>
      </div>
      <pre>
        <code
          className={language ? `hljs language-${language}` : 'hljs'}
          dangerouslySetInnerHTML={{ __html: html ?? escapeHtml(code) }}
        />
      </pre>
    </div>
  )
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode }
    return textOf(props.children)
  }
  return ''
}

const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...rest}>
              {children}
            </a>
          ),
          img: ({ src, alt, ...rest }) => (
            <img className="file-thumb" src={src} alt={alt ?? ''} loading="lazy" {...rest} />
          ),
          pre: ({ children }) => {
            const child = Children.toArray(children)[0]
            let code = ''
            let language = ''
            if (isValidElement(child)) {
              const props = child.props as { className?: string; children?: ReactNode }
              language = /language-([\w+-]+)/.exec(props.className ?? '')?.[1] ?? ''
              code = textOf(props.children).replace(/\n$/, '')
            } else {
              code = textOf(children)
            }
            return <CodeBlock code={code} language={language} />
          },
          table: ({ children, ...rest }) => (
            <div className="md-table-wrap">
              <table {...rest}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

export default Markdown