def runningTotal(xs: List[Int]): List[Int] =
  xs.scanLeft(0)(_ + _).tail
