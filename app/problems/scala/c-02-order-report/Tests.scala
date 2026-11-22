@main def tests(): Unit =
  val sample = List(
    Order("민수", "사과", 3, 1000),
    Order("영희", "배", 1, 3000),
    Order("민수", "배", 2, 3000),
    Order("철수", "사과", 5, 1000),
    Order("영희", "사과", 2, 1000))
  // sample 합계: 민수 9000, 영희 5000, 철수 5000

  // 1단계: totals
  Judge.check("1단계 totals › 고객별 수량 × 단가의 합")(
    totals(sample),
    Map("민수" -> 9000, "영희" -> 5000, "철수" -> 5000))
  Judge.check("1단계 totals › 주문이 하나뿐")(totals(List(Order("a", "x", 4, 25))), Map("a" -> 100))
  Judge.check("1단계 totals › 빈 목록은 빈 Map")(totals(Nil), Map.empty[String, Int])
  Judge.check("1단계 totals › 수량이 0인 주문도 고객으로 남는다")(
    totals(List(Order("a", "x", 0, 500), Order("b", "x", 1, 500))),
    Map("a" -> 0, "b" -> 500))

  // 2단계: topCustomers
  Judge.check("2단계 topCustomers › 합계 내림차순")(
    topCustomers(sample, 1),
    List(("민수", 9000)))
  Judge.check("2단계 topCustomers › 동점이면 이름 오름차순")(
    topCustomers(sample, 3),
    List(("민수", 9000), ("영희", 5000), ("철수", 5000)))
  Judge.check("2단계 topCustomers › 동점 정렬은 등장 순서와 무관")(
    topCustomers(List(Order("다", "x", 1, 10), Order("나", "x", 1, 10), Order("가", "x", 1, 10)), 2),
    List(("가", 10), ("나", 10)))
  Judge.check("2단계 topCustomers › 고객이 많아도 같은 규칙")(
    topCustomers(List("g", "f", "e", "d", "c", "b", "a").map(Order(_, "x", 1, 7)) :+ Order("z", "x", 2, 7), 4),
    List(("z", 14), ("a", 7), ("b", 7), ("c", 7)))
  Judge.check("2단계 topCustomers › n이 크거나 0 이하")(
    (topCustomers(sample, 10).size, topCustomers(sample, 0), topCustomers(sample, -2)),
    (3, Nil, Nil))

  // 3단계: bestByItem
  Judge.check("3단계 bestByItem › 품목별 수량 합이 가장 큰 고객")(
    bestByItem(sample),
    Map("사과" -> "철수", "배" -> "민수"))
  Judge.check("3단계 bestByItem › 한 주문의 크기가 아니라 수량의 합")(
    bestByItem(List(Order("a", "x", 2, 1), Order("a", "x", 2, 1), Order("b", "x", 3, 1))),
    Map("x" -> "a"))
  Judge.check("3단계 bestByItem › 수량이 같으면 이름 오름차순")(
    bestByItem(List(Order("나", "x", 2, 1), Order("가", "x", 1, 1), Order("가", "x", 1, 1), Order("다", "x", 1, 1))),
    Map("x" -> "가"))
  Judge.check("3단계 bestByItem › 여러 명이 같은 수량이면 가장 앞선 이름")(
    bestByItem(List("park", "lee", "seo", "kim", "jung", "han", "choi").map(Order(_, "x", 1, 1))),
    Map("x" -> "choi"))
  Judge.check("3단계 bestByItem › 빈 목록")(bestByItem(Nil), Map.empty[String, String])

  // 4단계: report
  Judge.check("4단계 report › 전체 모양")(
    report(sample, 2),
    List(
      "주문 5건, 고객 3명, 합계 19000원",
      "[상위 고객]",
      "1. 민수         9000원",
      "2. 영희         5000원",
      "[품목별 최다 구매]",
      "배: 민수",
      "사과: 철수"))
  Judge.check("4단계 report › 이름은 6칸 왼쪽 정렬, 금액은 8칸 오른쪽 정렬")(
    report(List(Order("alexander", "x", 1, 123456)), 1).drop(2).head,
    "1. alexander   123456원")
  Judge.check("4단계 report › 품목 줄은 품목 이름 순")(
    report(List("kiwi", "pear", "fig", "apple", "grape", "banana").map(i => Order("a", i, 1, 1)), 1).dropWhile(_ != "[품목별 최다 구매]").drop(1),
    List("apple: a", "banana: a", "fig: a", "grape: a", "kiwi: a", "pear: a"))
  Judge.check("4단계 report › 빈 주문")(
    report(Nil, 3),
    List("주문 0건, 고객 0명, 합계 0원", "[상위 고객]", "[품목별 최다 구매]"))
