interface WatchButtonProps {
  watched: boolean
  onToggle: () => void
}

// Milestone 29.0: star or unstar the open market.
function WatchButton({ watched, onToggle }: WatchButtonProps) {
  return (
    <button
      type="button"
      className={watched ? 'watch-button watch-button--on' : 'watch-button'}
      aria-pressed={watched}
      onClick={onToggle}
    >
      <span aria-hidden="true">{watched ? '★' : '☆'}</span> {watched ? 'On your watchlist' : 'Add to watchlist'}
    </button>
  )
}

export default WatchButton
