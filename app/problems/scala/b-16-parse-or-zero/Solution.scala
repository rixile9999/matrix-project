def parseOrZero(s: String): Int =
  s.toIntOption.getOrElse(0)
