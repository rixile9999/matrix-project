def nonNegativeMax(n: Int): Rand[Int] =
  map(double)(d => (d * (n + 1)).toInt)
