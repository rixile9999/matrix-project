def sumLeft(ints: List[Int]): Int =
  foldLeft(ints, 0)(_ + _)

def productLeft(ds: List[Double]): Double =
  foldLeft(ds, 1.0)(_ * _)

def lengthLeft[A](l: List[A]): Int =
  foldLeft(l, 0)((n, _) => n + 1)
