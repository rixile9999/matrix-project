def product(xs: List[Int]): Int =
  xs.foldLeft(1)(_ * _)
