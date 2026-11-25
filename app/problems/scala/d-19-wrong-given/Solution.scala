case class Ver(major: Int, minor: Int)

object Ver:
  given numeric: Ordering[Ver] = Ordering.by(v => (v.major, v.minor))

given byText: Ordering[Ver] = Ordering.by(v => s"${v.major}.${v.minor}")

extension (xs: List[Ver])
  def latest: Option[Ver] = xs.maxOption(using Ver.numeric)
  def sorted2: List[Ver] = xs.sorted(using Ver.numeric)
