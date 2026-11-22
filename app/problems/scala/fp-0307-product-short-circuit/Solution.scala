def productRight(l: List[Double]): Double =
  foldRight(l, 1.0)(_ * _)

val fCalls: Int = 4
