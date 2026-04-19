// Code syntax highlighting theme based on Flexoki colors
export interface CodeTheme {
  keyword: string;
  string: string;
  comment: string;
  number: string;
  function: string;
  type: string;
  variable: string;
  operator: string;
  tag: string;
  attribute: string;
  literal: string;
  built_in: string;
  title: string;
  params: string;
  regexp: string;
  meta: string;
  section: string;
  bullet: string;
  code: string;
  emphasis: string;
  strong: string;
}

const lightTheme: CodeTheme = {
  keyword: '#5c7c3a',      // Green
  string: '#9f7a4a',       // Orange
  comment: '#9a978a',      // Gray
  number: '#7c5ca0',       // Purple
  function: '#3a6cac',     // Blue
  type: '#5c7c3a',         // Green
  variable: '#8b5e3c',     // Brown
  operator: '#8b5e3c',     // Brown
  tag: '#ac3a58',          // Red
  attribute: '#9f7a4a',    // Orange
  literal: '#7c5ca0',      // Purple
  built_in: '#3a6cac',     // Blue
  title: '#3a6cac',        // Blue
  params: '#8b5e3c',       // Brown
  regexp: '#9f7a4a',       // Orange
  meta: '#9a978a',         // Gray
  section: '#3a6cac',      // Blue
  bullet: '#ac3a58',       // Red
  code: '#5a574f',         // Dark gray
  emphasis: '#5a574f',     // Dark gray
  strong: '#3a3028',       // Very dark brown
};

const darkTheme: CodeTheme = {
  keyword: '#8db55d',      // Green
  string: '#da702c',       // Orange
  comment: '#807e79',      // Gray
  number: '#c990fd',       // Purple
  function: '#78a9d9',     // Blue
  type: '#8db55d',         // Green
  variable: '#d4a373',     // Tan
  operator: '#d4a373',     // Tan
  tag: '#e07385',          // Red
  attribute: '#da702c',    // Orange
  literal: '#c990fd',      // Purple
  built_in: '#78a9d9',     // Blue
  title: '#78a9d9',        // Blue
  params: '#d4a373',       // Tan
  regexp: '#da702c',       // Orange
  meta: '#807e79',         // Gray
  section: '#78a9d9',      // Blue
  bullet: '#e07385',       // Red
  code: '#cecdc3',         // Light gray
  emphasis: '#cecdc3',     // Light gray
  strong: '#e8e5dc',       // Very light
};

export function generateCodeTheme(isDark: boolean): CodeTheme {
  return isDark ? darkTheme : lightTheme;
}

// React syntax highlighting styles object
export const defaultCodeLight: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: '#5a574f',
    background: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    tabSize: 2,
  },
  'pre[class*="language-"]': {
    color: '#5a574f',
    background: '#f5f5f0',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    tabSize: 2,
    padding: '1rem',
    margin: '0.5rem 0',
    overflow: 'auto',
    borderRadius: '0.5rem',
  },
  '.token.comment, .token.block-comment, .token.prolog, .token.doctype, .token.cdata': {
    color: '#9a978a',
  },
  '.token.punctuation': {
    color: '#5a574f',
  },
  '.token.tag, .token.attr-name, .token.namespace, .token.deleted': {
    color: '#ac3a58',
  },
  '.token.function-name': {
    color: '#3a6cac',
  },
  '.token.boolean, .token.number, .token.function': {
    color: '#7c5ca0',
  },
  '.token.property, .token.class-name, .token.constant, .token.symbol': {
    color: '#5c7c3a',
  },
  '.token.selector, .token.important, .token.atrule, .token.keyword, .token.builtin': {
    color: '#5c7c3a',
  },
  '.token.string, .token.char, .token.attr-value, .token.regex, .token.variable': {
    color: '#9f7a4a',
  },
  '.token.operator, .token.entity, .token.url': {
    color: '#8b5e3c',
  },
  '.token.important, .token.bold': {
    fontWeight: 'bold',
  },
  '.token.italic': {
    fontStyle: 'italic',
  },
  '.token.entity': {
    cursor: 'help',
  },
  '.token.inserted': {
    color: '#6aad4f',
  },
};

export const defaultCodeDark: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: '#cecdc3',
    background: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    tabSize: 2,
  },
  'pre[class*="language-"]': {
    color: '#cecdc3',
    background: '#1c1b1a',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    tabSize: 2,
    padding: '1rem',
    margin: '0.5rem 0',
    overflow: 'auto',
    borderRadius: '0.5rem',
  },
  '.token.comment, .token.block-comment, .token.prolog, .token.doctype, .token.cdata': {
    color: '#807e79',
  },
  '.token.punctuation': {
    color: '#9a9890',
  },
  '.token.tag, .token.attr-name, .token.namespace, .token.deleted': {
    color: '#e07385',
  },
  '.token.function-name': {
    color: '#78a9d9',
  },
  '.token.boolean, .token.number, .token.function': {
    color: '#c990fd',
  },
  '.token.property, .token.class-name, .token.constant, .token.symbol': {
    color: '#8db55d',
  },
  '.token.selector, .token.important, .token.atrule, .token.keyword, .token.builtin': {
    color: '#8db55d',
  },
  '.token.string, .token.char, .token.attr-value, .token.regex, .token.variable': {
    color: '#da702c',
  },
  '.token.operator, .token.entity, .token.url': {
    color: '#d4a373',
  },
  '.token.important, .token.bold': {
    fontWeight: 'bold',
  },
  '.token.italic': {
    fontStyle: 'italic',
  },
  '.token.entity': {
    cursor: 'help',
  },
  '.token.inserted': {
    color: '#6aad4f',
  },
};
