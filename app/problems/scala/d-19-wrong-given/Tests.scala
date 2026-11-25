@main def tests(): Unit =
  val vs = List(Ver(1, 9), Ver(1, 10), Ver(1, 2))
  Judge.check("latest")(vs.latest, Some(Ver(1, 10)))
  Judge.check("sorted2")(vs.sorted2, List(Ver(1, 2), Ver(1, 9), Ver(1, 10)))
  Judge.check("major가 우선")(List(Ver(2, 0), Ver(1, 99)).latest, Some(Ver(2, 0)))
  Judge.check("빈 리스트")(List.empty[Ver].latest, None)
  Judge.check("하나")(List(Ver(3, 3)).sorted2, List(Ver(3, 3)))
