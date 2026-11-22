def triples(n: Int): List[(Int, Int, Int)] =
  val found =
    for
      a <- 1 to n
      b <- a + 1 to n
      c <- b + 1 to n
      if a * a + b * b == c * c
    yield (a, b, c)
  found.toList
