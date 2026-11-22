def pairsSumTo(xs: List[Int], target: Int): List[(Int, Int)] =
  (for
    i <- xs.indices
    j <- i + 1 until xs.length
    if xs(i) + xs(j) == target
  yield (xs(i), xs(j))).toList
