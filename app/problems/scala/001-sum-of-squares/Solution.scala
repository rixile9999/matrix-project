def sumOfEvenSquares(xs: List[Int]): Int =
  xs.filter(_ % 2 == 0).map(x => x * x).sum
