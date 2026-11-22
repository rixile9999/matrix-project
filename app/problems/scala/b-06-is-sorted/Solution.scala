def isSorted(xs: List[Int]): Boolean =
  xs.zip(xs.drop(1)).forall((a, b) => a <= b)
