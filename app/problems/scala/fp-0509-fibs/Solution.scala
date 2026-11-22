def fibs: Stream[Int] =
  def go(a: Int, b: Int): Stream[Int] =
    Stream.cons(a, go(b, a + b))
  go(0, 1)
