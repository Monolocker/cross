import { describe, expect, it } from 'vitest'
import { safeHref } from './url'

// Milestone 28.0: only http(s) links from outside sources are clickable.
describe('safeHref', () => {
  it('keeps http and https links', () => {
    expect(safeHref('https://news.google.com/articles/abc?x=1')).toBe('https://news.google.com/articles/abc?x=1')
    expect(safeHref('http://espn.com/nfl/story')).toBe('http://espn.com/nfl/story')
    expect(safeHref('  https://espn.com/a  ')).toBe('https://espn.com/a')
  })

  it('drops scripts, data, other schemes, relative and missing links', () => {
    for (const url of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '/relative/path',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(safeHref(url)).toBeNull()
    }
  })
})
