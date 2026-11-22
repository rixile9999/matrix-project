def firstSquareOver(n: Int): Int =
  LazyList.from(1).map(k => k * k).find(_ > n).get
