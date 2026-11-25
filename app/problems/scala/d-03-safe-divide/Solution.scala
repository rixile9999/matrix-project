def safeDivide(a: String, b: String): Option[Int] =
  for
    x <- a.toIntOption
    y <- b.toIntOption
    if y != 0
  yield x / y
