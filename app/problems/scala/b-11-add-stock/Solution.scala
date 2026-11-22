def addStock(inv: Map[String, Int], item: String, n: Int): Map[String, Int] =
  inv.updated(item, inv.getOrElse(item, 0) + n)
