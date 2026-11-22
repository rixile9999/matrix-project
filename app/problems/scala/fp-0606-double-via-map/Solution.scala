def randDouble: Rand[Double] =
  map(nonNegativeInt)(_ / (Int.MaxValue.toDouble + 1))
