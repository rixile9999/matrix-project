def transform(xs: List[Int]): List[Int] =
  val f = new Function1[Int, Int]:
    def apply(x: Int): Int = x * 2 + 1
  xs.map(f)
