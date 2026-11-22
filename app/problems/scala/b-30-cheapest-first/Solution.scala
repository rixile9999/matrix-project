case class Item(name: String, price: Int)

def cheapestFirst(items: List[Item]): List[Item] =
  val byPrice: Ordering[Item] = Ordering.by(_.price)
  val byName: Ordering[Item] = Ordering.by(_.name)
  items.sorted(using byPrice.orElse(byName))
