import type { Operation } from './operation'
import c from 'picocolors'
import { x } from 'tinyexec'

const messageColorMap: Record<string, (c: string) => string> = {
  feat: c.green,
  feature: c.green,

  refactor: c.cyan,
  style: c.cyan,

  docs: c.blue,
  doc: c.blue,
  types: c.blue,
  type: c.blue,

  chore: c.gray,
  ci: c.gray,
  build: c.gray,
  deps: c.gray,
  dev: c.gray,

  fix: c.yellow,
  test: c.yellow,

  perf: c.magenta,

  revert: c.red,
  breaking: c.red,
}

interface ParsedCommit {
  hash: string
  message: string
  tag: string
  breaking?: boolean
  scope: string
  color: (c: string) => string
}

export function parseCommits(raw: string) {
  const lines = raw
    .toString()
    .trim()
    .split(/\n/g)

  if (!lines.length) {
    return []
  }

  return lines
    .map((line): ParsedCommit => {
      const [hash, ...parts] = line.split(' ')
      const message = parts.join(' ')
      const match = message.match(/^(\w+)(!)?(\([^)]+\))?(!)?:(.*)$/)
      if (match) {
        let color = messageColorMap[match[1].toLowerCase()] || ((c: string) => c)
        const breaking = match[2] === '!' || match[4] === '!'
        if (breaking) {
          color = s => c.inverse(c.red(s))
        }
        const tag = [match[1], match[2], match[4]].filter(Boolean).join('')
        const scope = match[3] || ''
        return {
          hash,
          tag,
          message: match[5].trim(),
          scope,
          breaking,
          color,
        }
      }
      return {
        hash,
        tag: '',
        message,
        scope: '',
        color: c => c,
      }
    })
    .reverse()
}

export function formatParsedCommits(commits: ParsedCommit[]) {
  const tagLength = commits.map(({ tag }) => tag.length).reduce((a, b) => Math.max(a, b), 0)
  let scopeLength = commits.map(({ scope }) => scope.length).reduce((a, b) => Math.max(a, b), 0)
  if (scopeLength)
    scopeLength += 2

  return commits.map(({ hash, tag, message, scope, color }) => {
    const paddedTag = tag.padStart(tagLength + 1, ' ')
    const paddedScope = !scope
      ? ' '.repeat(scopeLength)
      : c.dim('(') + scope.slice(1, -1) + c.dim(')') + ' '.repeat(scopeLength - scope.length)

    return [
      c.dim(hash),
      ' ',
      color === c.gray ? color(paddedTag) : c.bold(color(paddedTag)),
      ' ',
      paddedScope,
      c.dim(':'),
      ' ',
      color === c.gray ? color(message) : message,
    ].join('')
  })
}

export async function printRecentCommits(operation: Operation): Promise<void> {
  let sha: string | undefined
  sha ||= await x(
    'git',
    ['rev-list', '-n', '1', `v${operation.state.currentVersion}`],
    { nodeOptions: { stdio: 'pipe' }, throwOnError: false },
  )
    .then(res => res.stdout.trim())
  sha ||= await x(
    'git',
    ['rev-list', '-n', '1', operation.state.currentVersion],
    { nodeOptions: { stdio: 'pipe' }, throwOnError: false },
  )
    .then(res => res.stdout.trim())

  if (!sha) {
    console.log(
      c.blue(`i`)
      + c.gray(` Failed to locate the previous tag ${c.yellow(`v${operation.state.currentVersion}`)}`),
    )
    return
  }

  const { stdout } = await x(
    'git',
    [
      '--no-pager',
      'log',
      `${sha}..HEAD`,
      '--oneline',
    ],
    {
      nodeOptions: {
        stdio: 'pipe',
      },
    },
  )

  const parsed = parseCommits(stdout.toString().trim())
  const prettified = formatParsedCommits(parsed)

  if (!parsed.length) {
    console.log()
    console.log(c.blue(`i`) + c.gray(` No commits since ${operation.state.currentVersion}`))
    console.log()
    return
  }

  console.log()
  console.log(
    c.bold(
      `${c.green(parsed.length)} Commits since ${c.gray(sha.slice(0, 7))}:`,
    ),
  )
  console.log()
  console.log(prettified.join('\n'))
  console.log()
}
