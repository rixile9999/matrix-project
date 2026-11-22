def isArithmetic(xs: List[Int]): Boolean =
  val diffs = xs.zip(xs.drop(1)).map((a, b) => b - a)
  diffs.distinct.size <= 1
