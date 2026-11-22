def parsePair(s: String): Either[String, (Int, Int)] =
  def num(p: String): Either[String, Int] =
    p.trim.toIntOption.toRight("숫자 아님: " + p.trim)
  s.split(",", -1) match
    case Array(a, b) =>
      for
        x <- num(a)
        y <- num(b)
      yield (x, y)
    case _ => Left("형식 오류")
