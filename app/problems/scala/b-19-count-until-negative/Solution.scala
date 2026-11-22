def countUntilNegative(xs: List[Int]): Int = xs match
  case x :: t if x >= 0 => 1 + countUntilNegative(t)
  case _                => 0
