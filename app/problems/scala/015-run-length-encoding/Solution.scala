def encode(s: String): List[(Char, Int)] =
  def go(cs: List[Char]): List[(Char, Int)] = cs match
    case Nil => Nil
    case c :: _ =>
      val (run, rest) = cs.span(_ == c)
      (c, run.length) :: go(rest)
  go(s.toList)
