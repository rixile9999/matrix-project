def cheapPairs(prices: List[Int], budget: Int): List[(Int, Int)] =
  prices.flatMap(a =>
    prices
      .withFilter(b => a < b)
      .map(b => (b, a + b))
      .withFilter((_, total) => total <= budget)
      .map((b, total) => (a * b, total)))
