def withTax(prices: List[Int]): List[Int] =
  prices.map(p => p + p / 10)
