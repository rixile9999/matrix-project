extension (s: String)
  def truncate(n: Int): String =
    if s.length <= n then s else s.take(n - 1) + "…"
