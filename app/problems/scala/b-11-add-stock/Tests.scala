@main def tests(): Unit =
  Judge.check("있던 품목")(addStock(Map("펜" -> 2), "펜", 3), Map("펜" -> 5))
  Judge.check("새 품목")(addStock(Map("펜" -> 2), "자", 4), Map("펜" -> 2, "자" -> 4))
  Judge.check("빈 재고")(addStock(Map.empty, "풀", 1), Map("풀" -> 1))
  Judge.check("0개를 새 품목으로")(addStock(Map("펜" -> 2), "풀", 0), Map("펜" -> 2, "풀" -> 0))
