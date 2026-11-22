def longestRun(xs: List[Int]): Int =
  val (_, _, best) = xs.foldLeft((Option.empty[Int], 0, 0)) { case ((prev, cur, best), x) =>
    val next = if prev.exists(_ < x) then cur + 1 else 1
    (Some(x), next, best.max(next))
  }
  best
