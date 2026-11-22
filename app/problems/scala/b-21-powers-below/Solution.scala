def powersBelow(n: Int): List[Int] =
  LazyList.iterate(1)(_ * 2).takeWhile(_ < n).toList
