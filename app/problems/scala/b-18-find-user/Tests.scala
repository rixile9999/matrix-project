@main def tests(): Unit =
  val users = Map(1 -> "kim", 2 -> "lee")
  Judge.check("있는 사용자")(findUser(1, users), Right("kim"))
  Judge.check("다른 사용자")(findUser(2, users), Right("lee"))
  Judge.check("없는 사용자")(findUser(9, users), Left("없는 사용자: 9"))
  Judge.check("빈 맵")(findUser(1, Map.empty), Left("없는 사용자: 1"))
