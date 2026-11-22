case class Order(customer: String, item: String, qty: Int, unitPrice: Int)

def totals(orders: List[Order]): Map[String, Int] =
  orders.groupMapReduce(_.customer)(o => o.qty * o.unitPrice)(_ + _)

def topCustomers(orders: List[Order], n: Int): List[(String, Int)] =
  totals(orders).toList
    .sortBy((customer, total) => (-total, customer))
    .take(n)

def bestByItem(orders: List[Order]): Map[String, String] =
  orders
    .groupBy(_.item)
    .view
    .mapValues { itemOrders =>
      val qtyByCustomer = itemOrders.groupMapReduce(_.customer)(_.qty)(_ + _)
      qtyByCustomer.minBy((customer, qty) => (-qty, customer))._1
    }
    .toMap

def report(orders: List[Order], n: Int): List[String] =
  val all = totals(orders)
  val ranking = topCustomers(orders, n).zipWithIndex.map { case ((customer, total), i) =>
    f"${i + 1}%d. $customer%-6s $total%8d원"
  }
  val best = bestByItem(orders).toList.sorted.map((item, customer) => s"$item: $customer")
  List(s"주문 ${orders.size}건, 고객 ${all.size}명, 합계 ${all.values.sum}원", "[상위 고객]") ++
    ranking ++
    List("[품목별 최다 구매]") ++
    best
