def clamp(lo: Int, hi: Int)(x: Int): Int =
  x.max(lo).min(hi)
