def firstPrimes(n: Int): List[Int] =
  LazyList
    .from(2)
    .filter(k => (2 to math.sqrt(k).toInt).forall(k % _ != 0))
    .take(n)
    .toList
