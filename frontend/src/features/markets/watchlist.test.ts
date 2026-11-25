import { describe, expect, it } from 'vitest'
import { parseWatchlist, toggleWatch } from './watchlist'

describe('watchlist (29.0)', () => {
  it('reads stored ids, dropping junk and duplicates', () => {
    expect(parseWatchlist('["10219","372","10219"]')).toEqual(['10219', '372'])
    expect(parseWatchlist('["10219", 5, null, "abc", "<script>"]')).toEqual(['10219'])
  })

  it('treats missing or broken storage as an empty list', () => {
    expect(parseWatchlist(null)).toEqual([])
    expect(parseWatchlist('not json')).toEqual([])
    expect(parseWatchlist('{"ids":["1"]}')).toEqual([])
  })

  it('stars newest first and unstars on a second click', () => {
    const once = toggleWatch(['1'], '2')
    expect(once).toEqual(['2', '1'])
    expect(toggleWatch(once, '1')).toEqual(['2'])
  })
})
